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
} from "./types/sdkTypes";

import { webProvisionManager } from "../web/rainmaker/provisionManager";
import type { BleProvisioningNativeModule } from "./types/types";

/**
 * Web Bluetooth implementation of the native provisioning module contract.
 */
const BleProv: BleProvisioningNativeModule = {
  searchESPDevices: (
    devicePrefix: string,
    transport: BleProvisionTransportArg,
  ): Promise<BleProvisionDevice[]> =>
    webProvisionManager.searchESPDevices(devicePrefix, transport),

  stopESPDevicesSearch: (): Promise<void> =>
    webProvisionManager.stopESPDevicesSearch(),

  createESPDevice: (
    deviceName: string,
    transport: string,
    security?: number,
    proofOfPossession?: string,
    softAPPassword?: string,
    username?: string,
  ): Promise<BleProvisionDevice> =>
    webProvisionManager.createESPDevice(
      deviceName,
      transport,
      security,
      proofOfPossession,
      softAPPassword,
      username,
    ),

  connect: (deviceName: string): Promise<BleProvisionConnectStatus> =>
    webProvisionManager.connect(deviceName),

  disconnect: (deviceName: string): Promise<void> =>
    webProvisionManager.disconnect(deviceName),

  getDeviceCapabilities: (deviceName: string): Promise<string[]> =>
    webProvisionManager.getDeviceCapabilities(deviceName),

  getDeviceVersionInfo: (
    deviceName: string,
  ): Promise<Record<string, unknown>> =>
    webProvisionManager.getDeviceVersionInfo(deviceName),

  setProofOfPossession: (
    deviceName: string,
    proofOfPossession: string,
  ): Promise<boolean> =>
    webProvisionManager.setProofOfPossession(deviceName, proofOfPossession),

  initializeSession: (deviceName: string): Promise<boolean> =>
    webProvisionManager.initializeSession(deviceName),

  scanWifiList: (deviceName: string): Promise<BleProvisionWifiNetwork[]> =>
    webProvisionManager.scanWifiList(deviceName),

  sendData: (
    deviceName: string,
    endPoint: string,
    data: string,
  ): Promise<string> =>
    webProvisionManager.sendData(deviceName, endPoint, data),

  provision: (
    deviceName: string,
    ssid: string,
    passphrase: string,
  ): Promise<BleProvisionStatus> =>
    webProvisionManager.provision(deviceName, ssid, passphrase),
};

export default BleProv;
