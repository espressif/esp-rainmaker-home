/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPProvisioner } from "esp-ble-prov";

import {
  ESP_PROV_MANUFACTURER_DATA_KEY,
  ESP_PROV_PRIMARY_SERVICE_UUID,
  ESP_PROV_SEC_TYPE_2,
  ESP_PROV_TRANSPORT_BLE,
  enrichVersionInfoWithGattEndpoints,
} from "@modules/ble-prov";
import type { ScannedBleDevice } from "../types/types";
import { logWebBle } from "../utils/logger";
import {
  connectBleProvisioner,
  createInitialSecurityHandler,
  createSecurityHandler,
  disconnectBleProvisioner,
  resolveSec2Username,
} from "../protocomm";
import type { WebEspDeviceState } from "./types/types";
import {
  getCapabilitiesFromProtoVer,
  getSecurityFromProtoVer,
  readProtoVer,
} from "./utils/protoVer";

/**
 * Snapshot of proto-ver / PoP / GATT state used when establishing a session.
 * @param state - Connected RainMaker device state
 * @returns Diagnostic fields for BLE session logs
 */
export function getSessionDiagnostics(state: WebEspDeviceState): {
  deviceName: string;
  security: number;
  secVer: number | string | undefined;
  provVer: string | undefined;
  rmakerVer: string | undefined;
  capabilities: string[];
  rmakerCapabilities: string[];
  serviceUuid: string;
  hasPop: boolean;
  popLength: number;
  sec2Username: string;
  endpoints: string[];
} {
  return {
    deviceName: state.name,
    security: state.security,
    secVer: state.versionInfo.prov?.sec_ver,
    provVer: state.versionInfo.prov?.ver,
    rmakerVer: state.versionInfo.rmaker?.ver,
    capabilities: state.capabilities,
    rmakerCapabilities: Array.isArray(state.versionInfo.rmaker?.cap)
      ? state.versionInfo.rmaker.cap
      : [],
    serviceUuid: state.serviceUuid,
    hasPop: Boolean(state.proofOfPossession),
    popLength: state.proofOfPossession.length,
    sec2Username: resolveSec2Username(state.capabilities, state.username),
    endpoints: state.provisioner
      ? Array.from(state.provisioner.endpoints.keys())
      : [],
  };
}

/**
 * Rebuilds the security handler for Security0 / Security1 / Security2 from the
 * current proto-ver metadata, capabilities, and PoP.
 * @param state - Connected device whose GATT session is already open
 * @param options - When `refreshFromDevice` is true, re-read plaintext proto-ver
 */
export async function applyProtoVerSecurity(
  state: WebEspDeviceState,
  options: { refreshFromDevice?: boolean } = {},
): Promise<void> {
  if (!state.provisioner) {
    throw new Error("Device not connected");
  }

  const refreshFromDevice = options.refreshFromDevice !== false;
  let versionInfo = state.versionInfo;

  if (refreshFromDevice) {
    versionInfo = enrichVersionInfoWithGattEndpoints(
      await readProtoVer(state.provisioner),
      Array.from(state.provisioner.endpoints.keys()),
    );
  } else {
    versionInfo = enrichVersionInfoWithGattEndpoints(
      state.versionInfo,
      Array.from(state.provisioner.endpoints.keys()),
    );
  }

  const capabilities = getCapabilitiesFromProtoVer(versionInfo);
  const resolvedSecurity = getSecurityFromProtoVer(versionInfo, capabilities);

  state.versionInfo = versionInfo;
  state.capabilities = capabilities;
  state.security = resolvedSecurity;
  state.username = resolveSec2Username(capabilities, state.username || undefined);
  state.provisioner.security = createSecurityHandler(
    resolvedSecurity,
    state.proofOfPossession,
    state.username,
    capabilities,
  );

  logWebBle("session:proto-ver", {
    ...getSessionDiagnostics(state),
    refreshFromDevice,
  });
}

/**
 * Connects over BLE, reads proto-ver, and negotiates RainMaker security metadata.
 * @param scanned - Scanned device metadata
 * @param securityType - Initial security level before proto-ver negotiation
 * @param proofOfPossession - Optional PoP
 * @param username - Optional Security2 username
 * @returns Connected RainMaker device state
 */
export async function connectRainMakerDevice(
  scanned: ScannedBleDevice,
  securityType: number = ESP_PROV_SEC_TYPE_2,
  proofOfPossession: string = "",
  username: string = "",
): Promise<WebEspDeviceState> {
  logWebBle("connect:start", {
    name: scanned.name,
    hasBluetoothDevice: Boolean(scanned.bluetoothDevice),
    serviceUuid: scanned.serviceUuid,
    securityType,
  });

  const serviceUuid = scanned.serviceUuid || ESP_PROV_PRIMARY_SERVICE_UUID;
  const provisioner = new ESPProvisioner({
    deviceNamePrefix: scanned.name,
    serviceUUID: serviceUuid,
    security: createInitialSecurityHandler(securityType, proofOfPossession),
  });

  await connectBleProvisioner(provisioner, scanned, serviceUuid);

  const state: WebEspDeviceState = {
    name: scanned.name,
    transport: ESP_PROV_TRANSPORT_BLE,
    security: securityType,
    serviceUuid,
    proofOfPossession,
    username,
    bluetoothDevice: provisioner.device ?? scanned.bluetoothDevice,
    provisioner,
    versionInfo: {},
    capabilities: [],
    connected: true,
    sessionEstablished: false,
    advertisementData: scanned.manufacturerData.length
      ? { [ESP_PROV_MANUFACTURER_DATA_KEY]: scanned.manufacturerData }
      : undefined,
  };

  await applyProtoVerSecurity(state);
  return state;
}

/**
 * Disconnects and cleans up a RainMaker web ESP device.
 * @param state - Device state to tear down
 */
export async function disconnectRainMakerDevice(
  state: WebEspDeviceState,
): Promise<void> {
  if (state.provisioner) {
    await disconnectBleProvisioner(state.provisioner);
  }
  state.connected = false;
  state.sessionEstablished = false;
  state.provisioner = undefined;
}
