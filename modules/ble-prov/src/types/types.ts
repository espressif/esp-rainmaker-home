/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BleProvisionConnectStatus,
  BleProvisionDevice,
  BleProvisionStatus,
  BleProvisionTransportArg,
  BleProvisionWifiNetwork,
} from "./sdkTypes";

/** Parsed `proto-ver` JSON payload from the device. */
export interface EspProtoVerInfo {
  prov?: {
    ver?: string;
    /** Security scheme; firmware usually sends a number, some payloads use a string. */
    sec_ver?: number | string;
    sec_patch_ver?: number;
    cap?: string[];
  };
  rmaker?: {
    ver?: string;
    cap?: string[];
  };
  rmaker_extra?: {
    cap?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Native / web provisioning bridge surface mirrored from `ESPProvModule`.
 * Implemented by platform `BleProv.*` entry points.
 */
export interface BleProvisioningNativeModule {
  searchESPDevices: (
    devicePrefix: string,
    transport: BleProvisionTransportArg,
  ) => Promise<BleProvisionDevice[]>;
  stopESPDevicesSearch: () => Promise<void>;
  createESPDevice: (
    deviceName: string,
    transport: string,
    security?: number,
    proofOfPossession?: string,
    softAPPassword?: string,
    username?: string,
  ) => Promise<BleProvisionDevice>;
  connect: (deviceName: string) => Promise<BleProvisionConnectStatus>;
  disconnect: (deviceName: string) => Promise<void>;
  getDeviceCapabilities: (deviceName: string) => Promise<string[]>;
  getDeviceVersionInfo: (
    deviceName: string,
  ) => Promise<Record<string, unknown>>;
  setProofOfPossession: (
    deviceName: string,
    proofOfPossession: string,
  ) => Promise<boolean>;
  initializeSession: (deviceName: string) => Promise<boolean>;
  scanWifiList: (deviceName: string) => Promise<BleProvisionWifiNetwork[]>;
  sendData: (
    deviceName: string,
    endPoint: string,
    data: string,
  ) => Promise<string>;
  provision: (
    deviceName: string,
    ssid: string,
    passphrase: string,
  ) => Promise<BleProvisionStatus>;
}

export type {
  BleProvisionConnectStatus,
  BleProvisionDevice,
  BleProvisionStatus,
  BleProvisionTransport,
  BleProvisionTransportArg,
  BleProvisionWifiNetwork,
} from "./sdkTypes";
