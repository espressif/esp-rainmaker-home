/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IWiFiScanResult } from "esp-ble-prov";

import {
  BleProvisionTransport,
  ESP_PROV_DEVICE_PREFIX,
  ESP_PROV_MANUFACTURER_DATA_KEY,
  ESP_PROV_SEC_TYPE_2,
  ESP_PROV_SERVICE_UUIDS,
  ESP_PROV_TRANSPORT_BLE,
  enrichVersionInfoWithGattEndpoints,
  type BleProvisionDevice,
  type BleProvisionStatus,
  type BleProvisionWifiNetwork,
} from "@modules/ble-prov";
import type { ScannedBleDevice } from "../types/types";
import {
  getWebBluetoothAvailability,
  isBleAdvertisementScanSupported,
  isWebBluetoothSupported,
} from "../utils/support";
import { logWebBle, logWebBleError } from "../utils/logger";
import { requestBleDevice, scanBleAdvertisements } from "../scanner";
import { stopActiveScan } from "../utils/scanRegistry";
import { createSecurityHandler, ensureProvisionerEndpoint } from "../protocomm";
import type { WebEspDeviceState } from "./types/types";
import { buildAdvertisementData } from "./utils/advertisement";
import {
  connectRainMakerDevice,
  disconnectRainMakerDevice,
} from "./deviceConnection";
import {
  clearDeviceRegistry,
  getAllRegisteredDevices,
  getRegisteredDevice,
  registerDevice,
  unregisterDevice,
} from "./utils/deviceRegistry";
import {
  getCapabilitiesFromProtoVer,
  readProtoVer,
} from "./utils/protoVer";

/**
 * Refreshes proto-ver when missing and merges GATT endpoint capabilities into version info.
 * @param state - Connected web device state
 */
async function syncVersionInfoFromDevice(state: WebEspDeviceState): Promise<void> {
  if (!state.provisioner) {
    return;
  }

  const endpointNames: string[] = Array.from(state.provisioner.endpoints.keys());
  const versionInfoIsEmpty = Object.keys(state.versionInfo).length === 0;

  if (state.sessionEstablished && versionInfoIsEmpty) {
    try {
      const freshVersionInfo = await readProtoVer(state.provisioner);
      state.versionInfo = freshVersionInfo;
      state.capabilities = getCapabilitiesFromProtoVer(freshVersionInfo);
      logWebBle("version-info:refreshed", {
        deviceName: state.name,
        versionInfo: freshVersionInfo,
      });
    } catch (error) {
      logWebBleError("version-info:refresh-failed", error);
    }
  }

  state.versionInfo = enrichVersionInfoWithGattEndpoints(
    state.versionInfo,
    endpointNames,
  );
  state.capabilities = getCapabilitiesFromProtoVer(state.versionInfo);
}

/**
 * Maps internal device state to the SDK `ESPDeviceInterface` shape.
 * @param state - Web device state
 * @returns SDK-facing device descriptor
 */
function toEspDeviceInterface(state: WebEspDeviceState): BleProvisionDevice {
  return {
    name: state.name,
    security: state.security,
    transport: state.transport,
    connected: state.connected,
    username: state.username || undefined,
    capabilities: state.capabilities,
    advertisementData: state.advertisementData as BleProvisionDevice["advertisementData"],
    versionInfo: [state.versionInfo],
  };
}

/**
 * RainMaker web provisioning manager — mirrors the native `ESPProvModule` contract
 * used by `ESPProvAdapter` on Android/iOS. Built on the generic BLE web stack.
 */
export const webProvisionManager = {
  /**
   * Returns whether Web Bluetooth can be used in the current browser.
   * @returns True when supported and available
   */
  async isSupported(): Promise<boolean> {
    return isWebBluetoothSupported() && (await getWebBluetoothAvailability());
  },

  /**
   * Searches for ESP devices over BLE using passive scan or the device picker.
   * @param devicePrefix - BLE name prefix filter
   * @param transport - Transport type (`ble` or `softap`)
   * @returns Discovered ESP devices
   */
  async searchESPDevices(
    devicePrefix: string,
    transport: string,
  ): Promise<BleProvisionDevice[]> {
    if (transport !== BleProvisionTransport.BLE && transport !== "ble") {
      throw new Error("SoftAP device search is not supported on web");
    }

    if (!isWebBluetoothSupported()) {
      throw new Error("Web Bluetooth is not supported in this browser");
    }

    logWebBle("search:start", { devicePrefix, transport });

    clearDeviceRegistry();

    const prefix = devicePrefix || ESP_PROV_DEVICE_PREFIX;
    let scanned: ScannedBleDevice[] = [];

    if (isBleAdvertisementScanSupported()) {
      try {
        scanned = await scanBleAdvertisements(ESP_PROV_SERVICE_UUIDS, prefix);
      } catch (error) {
        console.warn("[WebProvisionManager] Passive BLE scan failed:", error);
      }
    }

    if (scanned.length === 0) {
      logWebBle("search:opening-picker", { prefix });
      scanned = [
        await requestBleDevice(ESP_PROV_SERVICE_UUIDS, undefined, prefix),
      ];
    }

    logWebBle("search:devices-found", {
      count: scanned.length,
      names: scanned.map((entry) => entry.name),
    });

    const devices = scanned.map((entry) => {
      const state: WebEspDeviceState = {
        name: entry.name,
        transport: ESP_PROV_TRANSPORT_BLE,
        security: ESP_PROV_SEC_TYPE_2,
        serviceUuid: entry.serviceUuid,
        proofOfPossession: "",
        username: "",
        bluetoothDevice: entry.bluetoothDevice,
        versionInfo: {},
        capabilities: [],
        connected: false,
        sessionEstablished: false,
        advertisementData: buildAdvertisementData(entry.manufacturerData),
      };
      registerDevice(state);
      return toEspDeviceInterface(state);
    });

    logWebBle("search:complete", {
      count: devices.length,
      names: devices.map((device) => device.name),
    });

    return devices;
  },

  /**
   * Stops any active passive BLE scan.
   */
  async stopESPDevicesSearch(): Promise<void> {
    await stopActiveScan();
  },

  /**
   * Creates a device entry for QR/manual flows and registers it for connect.
   * @param name - Device name from QR payload
   * @param transport - Transport string
   * @param security - Security level
   * @param proofOfPossession - Optional PoP
   * @param _softAPPassword - Unused on web
   * @param username - Optional Security2 username
   * @returns Created device descriptor
   */
  async createESPDevice(
    name: string,
    transport: string,
    security: number = ESP_PROV_SEC_TYPE_2,
    proofOfPossession?: string,
    _softAPPassword?: string,
    username?: string,
  ): Promise<BleProvisionDevice> {
    if (transport.toLowerCase() !== ESP_PROV_TRANSPORT_BLE) {
      throw new Error("Only BLE transport is supported for web provisioning");
    }

    if (!(await this.isSupported())) {
      throw new Error("Web Bluetooth is not available in this browser");
    }

    clearDeviceRegistry();

    const scanned = await requestBleDevice(
      ESP_PROV_SERVICE_UUIDS,
      name,
      ESP_PROV_DEVICE_PREFIX,
    );
    const state: WebEspDeviceState = {
      name: scanned.name,
      transport: ESP_PROV_TRANSPORT_BLE,
      security,
      serviceUuid: scanned.serviceUuid,
      proofOfPossession: proofOfPossession ?? "",
      username: username ?? "",
      bluetoothDevice: scanned.bluetoothDevice,
      versionInfo: {},
      capabilities: [],
      connected: false,
      sessionEstablished: false,
      advertisementData: buildAdvertisementData(scanned.manufacturerData),
    };

    registerDevice(state);
    return toEspDeviceInterface(state);
  },

  /**
   * Connects to a previously discovered or created BLE device.
   * @param deviceName - Target device name
   * @returns Connection status code (`0` = connected)
   */
  async connect(deviceName: string): Promise<0 | 1> {
    logWebBle("pair:connect-start", { deviceName });

    const existing = getRegisteredDevice(deviceName);
    if (!existing) {
      logWebBleError("pair:connect-failed", `No registered device: ${deviceName}`);
      throw new Error(`No devices found for: ${deviceName}`);
    }

    try {
      const scanned: ScannedBleDevice = {
        name: existing.name,
        bluetoothDevice:
          existing.bluetoothDevice ??
          (await requestBleDevice(ESP_PROV_SERVICE_UUIDS, deviceName))
            .bluetoothDevice,
        serviceUuid: existing.serviceUuid,
        manufacturerData:
          existing.advertisementData?.[ESP_PROV_MANUFACTURER_DATA_KEY] ?? [],
      };

      logWebBle("pair:gatt-connecting", {
        deviceName,
        hasBluetoothDevice: Boolean(scanned.bluetoothDevice),
        serviceUuid: scanned.serviceUuid,
      });

      const connected = await connectRainMakerDevice(
        scanned,
        existing.security,
        existing.proofOfPossession,
        existing.username,
      );

      registerDevice(connected);
      logWebBle("pair:connect-success", {
        deviceName,
        capabilities: connected.capabilities,
        security: connected.security,
      });
      return 0;
    } catch (error) {
      logWebBleError("pair:connect-failed", error);
      return 1;
    }
  },

  /**
   * Returns provisioning capabilities advertised in proto-ver.
   * @param deviceName - Connected device name
   * @returns Capability strings
   */
  async getDeviceCapabilities(deviceName: string): Promise<string[]> {
    logWebBle("pair:get-capabilities", { deviceName });
    const state = getRegisteredDevice(deviceName);
    if (!state?.connected) {
      logWebBleError("pair:get-capabilities-failed", "Device not connected");
      throw new Error("Device not found or not connected");
    }

    await syncVersionInfoFromDevice(state);

    logWebBle("pair:capabilities", { deviceName, capabilities: state.capabilities });
    return state.capabilities;
  },

  /**
   * Returns parsed proto-ver JSON from the connected device.
   * @param deviceName - Connected device name
   * @returns Version info object
   */
  async getDeviceVersionInfo(
    deviceName: string,
  ): Promise<Record<string, unknown>> {
    logWebBle("pair:get-version-info", { deviceName });
    const state = getRegisteredDevice(deviceName);
    if (!state?.connected) {
      logWebBleError("pair:get-version-info-failed", "Device not connected");
      throw new Error("Device not found or not connected");
    }

    await syncVersionInfoFromDevice(state);

    logWebBle("pair:version-info", {
      deviceName,
      versionInfo: state.versionInfo,
      endpoints: state.provisioner
        ? Array.from(state.provisioner.endpoints.keys())
        : [],
    });
    return state.versionInfo as Record<string, unknown>;
  },

  /**
   * Returns whether a protocomm endpoint was discovered for a connected device.
   * @param deviceName - Connected device name
   * @param endPoint - Endpoint name
   * @returns True when the endpoint is mapped on the provisioner
   */
  hasEndpoint(deviceName: string, endPoint: string): boolean {
    const state = getRegisteredDevice(deviceName);
    return Boolean(state?.provisioner?.endpoints.has(endPoint));
  },

  /**
   * Lists protocomm endpoints discovered for a connected device.
   * @param deviceName - Connected device name
   * @returns Endpoint names known to the provisioner
   */
  listEndpoints(deviceName: string): string[] {
    const state = getRegisteredDevice(deviceName);
    if (!state?.provisioner) {
      return [];
    }
    return Array.from(state.provisioner.endpoints.keys());
  },

  /**
   * Stores proof-of-possession and rebuilds the security handler when connected.
   * @param deviceName - Device name
   * @param proofOfPossession - PoP string
   * @returns True on success
   */
  async setProofOfPossession(
    deviceName: string,
    proofOfPossession: string,
  ): Promise<boolean> {
    const state = getRegisteredDevice(deviceName);
    if (!state) {
      throw new Error("Device not found");
    }

    state.proofOfPossession = proofOfPossession;

    if (state.provisioner && state.connected) {
      state.provisioner.security = createSecurityHandler(
        state.security,
        proofOfPossession,
        state.username,
        state.capabilities,
      );
    }

    return true;
  },

  /**
   * Establishes the encrypted protocomm session with the device.
   * @param deviceName - Connected device name
   * @returns True when the session is ready
   */
  async initializeSession(deviceName: string): Promise<boolean> {
    logWebBle("pair:initialize-session-start", { deviceName });
    const state = getRegisteredDevice(deviceName);
    if (!state?.provisioner || !state.connected) {
      logWebBleError("pair:initialize-session-failed", "Device not connected");
      throw new Error("Device not found or not connected");
    }

    await state.provisioner.establishSession();
    state.sessionEstablished = true;
    await syncVersionInfoFromDevice(state);
    logWebBle("pair:initialize-session-success", {
      deviceName,
      versionInfo: state.versionInfo,
    });
    return true;
  },

  /**
   * Scans Wi-Fi networks visible to the ESP device.
   * @param deviceName - Connected device name
   * @returns Wi-Fi AP list
   */
  async scanWifiList(deviceName: string): Promise<BleProvisionWifiNetwork[]> {
    const state = getRegisteredDevice(deviceName);
    if (!state?.provisioner || !state.sessionEstablished) {
      throw new Error("Device session not initialized");
    }

    const networks: IWiFiScanResult[] =
      await state.provisioner.scan();
    const textDecoder = new TextDecoder();

    return networks.map((network: IWiFiScanResult) => ({
      ssid: network.ssid ? textDecoder.decode(network.ssid) : "",
      rssi: network.rssi ?? 0,
      auth: network.auth ?? 0,
      secure: (network.auth ?? 0) > 0,
      channel: network.channel ?? undefined,
      bssid: network.bssid
        ? Array.from(network.bssid)
            .map((byte: number) => byte.toString(16).padStart(2, "0"))
            .join(":")
        : undefined,
    }));
  },

  /**
   * Sends Base64-encoded data to a custom protocomm endpoint.
   * @param deviceName - Connected device name
   * @param endPoint - Endpoint name
   * @param data - Base64 payload
   * @returns Base64-encoded response
   */
  async sendData(
    deviceName: string,
    endPoint: string,
    data: string,
  ): Promise<string> {
    const state = getRegisteredDevice(deviceName);
    if (!state?.provisioner || !state.sessionEstablished) {
      throw new Error("Device session not initialized");
    }

    logWebBle("sendData:start", {
      deviceName,
      endPoint,
      knownEndpoints: Array.from(state.provisioner.endpoints.keys()),
    });

    const hasEndpoint = await ensureProvisionerEndpoint(
      state.provisioner,
      endPoint,
    );
    if (!hasEndpoint) {
      const message = `Characteristic "${endPoint}" not found after endpoint discovery`;
      logWebBleError("sendData:endpoint-missing", message);
      throw new Error(message);
    }

    const decoded = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    await state.provisioner.writeValueToEndpoint(endPoint, decoded);
    const response = await state.provisioner.readValueFromEndpoint(endPoint);
    logWebBle("sendData:complete", { deviceName, endPoint });
    return btoa(String.fromCharCode(...response));
  },

  /**
   * Provisions Wi-Fi credentials on the connected device.
   * @param deviceName - Connected device name
   * @param ssid - Target SSID
   * @param passphrase - Wi-Fi password
   * @returns Provisioning status
   */
  async provision(
    deviceName: string,
    ssid: string,
    passphrase: string,
  ): Promise<BleProvisionStatus> {
    const state = getRegisteredDevice(deviceName);
    if (!state?.provisioner || !state.sessionEstablished) {
      throw new Error("Device session not initialized");
    }

    const textEncoder = new TextEncoder();

    try {
      await state.provisioner.sendCredentials({
        ssid: textEncoder.encode(ssid),
        passphrase: textEncoder.encode(passphrase),
        bssid: undefined,
        channel: undefined,
      });
      return 0;
    } catch (error) {
      console.error("[WebProvisionManager] provision failed:", error);
      return 1;
    }
  },

  /**
   * Disconnects from the device and clears runtime state.
   * @param deviceName - Device name
   */
  async disconnect(deviceName: string): Promise<void> {
    const state = getRegisteredDevice(deviceName);
    if (state) {
      await disconnectRainMakerDevice(state);
      unregisterDevice(deviceName);
    }
  },

  /**
   * Returns all devices currently registered (mainly for diagnostics).
   * @returns Registered device interfaces
   */
  getRegisteredDevices(): BleProvisionDevice[] {
    return getAllRegisteredDevices().map(toEspDeviceInterface);
  },
};
