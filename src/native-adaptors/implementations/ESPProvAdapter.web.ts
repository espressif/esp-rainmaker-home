/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPDeviceInterface,
  ESPProvisionStatus,
  ESPWifiList,
  ESPTransport,
  ESPProvisionAdapterInterface,
  ESPConnectStatus,
} from "@store";

import {
  isWebBluetoothSupported,
  logWebBle,
  webProvisionManager,
} from "@modules/ble-prov/web";
import { createWebUnsupportedError } from "@native-adaptors/utils/webPlatform";

/**
 * Throws when Web Bluetooth is unavailable in the current browser.
 */
function assertWebBluetoothSupported(): void {
  if (!isWebBluetoothSupported()) {
    throw createWebUnsupportedError(
      "device provisioning (Web Bluetooth not supported — use Chrome or Edge on desktop/Android)",
    );
  }
}

/** Web Bluetooth ESP-IDF provisioning adaptor for browser builds. */
export const provisionAdapter: ESPProvisionAdapterInterface = {
  /**
   * Searches for ESP BLE devices via Web Bluetooth passive scan or device picker.
   * @param devicePrefix - BLE name prefix (e.g. `PROV_`)
   * @param transport - Transport type (`ble` or `softap`)
   * @returns Discovered ESP devices
   */
  searchESPDevices: async (
    devicePrefix: string,
    transport: ESPTransport,
  ): Promise<ESPDeviceInterface[]> => {
    assertWebBluetoothSupported();
    logWebBle("adapter:search", { devicePrefix, transport });
    return webProvisionManager.searchESPDevices(
      devicePrefix,
      transport,
    ) as Promise<ESPDeviceInterface[]>;
  },

  /**
   * Connects to a BLE device and reads proto-ver metadata.
   * @param deviceName - Target device name
   * @returns Connection status
   */
  connect: async (deviceName: string): Promise<ESPConnectStatus> => {
    assertWebBluetoothSupported();
    logWebBle("adapter:connect", { deviceName });
    return webProvisionManager.connect(deviceName);
  },

  /**
   * Sends Base64 data to a custom protocomm endpoint.
   * @param deviceName - Connected device name
   * @param endPoint - Endpoint name
   * @param data - Base64 payload
   * @returns Base64 response from the device
   */
  sendData: async (
    deviceName: string,
    endPoint: string,
    data: string,
  ): Promise<string> => {
    assertWebBluetoothSupported();
    return webProvisionManager.sendData(deviceName, endPoint, data);
  },

  /**
   * Scans Wi-Fi networks visible to the ESP device.
   * @param deviceName - Connected device name
   * @returns Wi-Fi network list
   */
  scanWifiList: async (deviceName: string): Promise<ESPWifiList[]> => {
    assertWebBluetoothSupported();
    return webProvisionManager.scanWifiList(deviceName);
  },

  /**
   * Provisions the device with Wi-Fi credentials.
   * @param deviceName - Connected device name
   * @param ssid - Wi-Fi SSID
   * @param passphrase - Wi-Fi password
   * @returns Provisioning result status
   */
  provision: async (
    deviceName: string,
    ssid: string,
    passphrase: string,
  ): Promise<ESPProvisionStatus> => {
    assertWebBluetoothSupported();
    return webProvisionManager.provision(deviceName, ssid, passphrase);
  },

  /**
   * Stores proof-of-possession for Security1/2.
   * @param deviceName - Device name
   * @param proofOfPossession - PoP string
   * @returns True on success
   */
  setProofOfPossession: async (
    deviceName: string,
    proofOfPossession: string,
  ): Promise<boolean> => {
    assertWebBluetoothSupported();
    return webProvisionManager.setProofOfPossession(
      deviceName,
      proofOfPossession,
    );
  },

  /**
   * Establishes the encrypted protocomm session.
   * @param deviceName - Connected device name
   * @returns True when the session is ready
   */
  initializeSession: async (deviceName: string): Promise<boolean> => {
    assertWebBluetoothSupported();
    return webProvisionManager.initializeSession(deviceName);
  },

  /**
   * Creates a device entry for QR/manual provisioning flows.
   * @param deviceName - Device name from QR payload
   * @param transport - Transport string
   * @param security - Security level
   * @param proofOfPossession - Optional PoP
   * @param softAPPassword - Unused on web
   * @param username - Optional Security2 username
   * @returns Created device descriptor
   */
  createESPDevice: async (
    deviceName: string,
    transport: string,
    security?: number,
    proofOfPossession?: string,
    softAPPassword?: string,
    username?: string,
  ): Promise<ESPDeviceInterface> => {
    assertWebBluetoothSupported();
    return webProvisionManager.createESPDevice(
      deviceName,
      transport,
      security,
      proofOfPossession,
      softAPPassword,
      username,
    ) as Promise<ESPDeviceInterface>;
  },

  /**
   * Returns device capabilities from proto-ver.
   * @param deviceName - Connected device name
   * @returns Capability strings
   */
  getDeviceCapabilities: async (deviceName: string): Promise<string[]> => {
    assertWebBluetoothSupported();
    return webProvisionManager.getDeviceCapabilities(deviceName);
  },

  /**
   * Stops an in-progress passive BLE scan.
   */
  stopESPDevicesSearch: async (): Promise<void> => {
    await webProvisionManager.stopESPDevicesSearch();
  },

  /**
   * Disconnects from the BLE device.
   * @param deviceName - Device name
   */
  disconnect: async (deviceName: string): Promise<void> => {
    await webProvisionManager.disconnect(deviceName);
  },

  /**
   * Returns proto-ver JSON from the connected device.
   * @param deviceName - Connected device name
   * @returns Version info object
   */
  getDeviceVersionInfo: async (
    deviceName: string,
  ): Promise<Record<string, unknown>> => {
    assertWebBluetoothSupported();
    return webProvisionManager.getDeviceVersionInfo(deviceName);
  },
};

/**
 * Neo SDK adapter contract names this `getDeviceVersion`; Classic uses
 * `getDeviceVersionInfo`. Both read the same proto-ver payload.
 */
(
  provisionAdapter as ESPProvisionAdapterInterface & {
    getDeviceVersion: ESPProvisionAdapterInterface["getDeviceVersionInfo"];
  }
).getDeviceVersion = provisionAdapter.getDeviceVersionInfo;

export default provisionAdapter;
