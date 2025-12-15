/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
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
} from "@espressif/rainmaker-base-sdk";
import ESPProvModule from "../interfaces/ESPProvInterface";

export const provisionAdapter: ESPProvisionAdapterInterface = {
  /**
   * Searches for ESP devices using the specified device prefix and transport type.
   *
   * @param {string} devicePrefix - The prefix to filter ESP devices.
   * @param {ESPTransport} transport - The transport type (BLE or Wi-Fi).
   * @returns {Promise<ESPDeviceInterface[]>} - A promise that resolves to a list of discovered devices.
   */
  searchESPDevices: async (
    devicePrefix: string,
    transport: ESPTransport
  ): Promise<ESPDeviceInterface[]> => {
    try {
      const espDevices = await ESPProvModule.searchESPDevices(
        devicePrefix,
        transport
      );
      return espDevices;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Connects to the specified ESP device.
   *
   * @param {string} deviceName - The name of the ESP device.
   * @returns {Promise<ESPConnectStatus>} - A promise that resolves to the connection status.
   */
  connect: async (deviceName: string): Promise<ESPConnectStatus> => {
    try {
      const status = await ESPProvModule.connect(deviceName);
      return status;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Sends data to the ESP device on a specified endpoint.
   *
   * @param {string} deviceName - The name of the ESP device.
   * @param {string} endPoint - The endpoint on the device to send data.
   * @param {string} data - The data to send.
   * @returns {Promise<string>} - A promise that resolves to the response from the device.
   */
  sendData: async (
    deviceName: string,
    endPoint: string,
    data: string
  ): Promise<string> => {
    try {
      const response = await ESPProvModule.sendData(deviceName, endPoint, data);
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Scans for available Wi-Fi networks.
   *
   * @param {string} deviceName - The name of the ESP device.
   * @returns {Promise<ESPWifiList[]>} - A promise that resolves to a list of available Wi-Fi networks.
   */
  scanWifiList: async (deviceName: string): Promise<ESPWifiList[]> => {
    try {
      const wifiList = await ESPProvModule.scanWifiList(deviceName);
      return wifiList;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Provisions the ESP device with the specified Wi-Fi credentials.
   *
   * @param {string} deviceName - The name of the ESP device.
   * @param {string} ssid - The SSID of the Wi-Fi network.
   * @param {string} passphrase - The Wi-Fi password.
   * @returns {Promise<ESPProvisionStatus>} - A promise that resolves to the provisioning status.
   */
  provision: async (
    deviceName: string,
    ssid: string,
    passphrase: string
  ): Promise<ESPProvisionStatus> => {
    try {
      const status = await ESPProvModule.provision(
        deviceName,
        ssid,
        passphrase
      );
      return status;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Sets the Proof of Possession (POP) for the ESP device.
   *
   * @param {string} deviceName - The name of the ESP device.
   * @param {string} proofOfPossession - The Proof of Possession.
   * @returns {Promise<boolean>} - A promise that resolves to whether the operation was successful.
   */
  setProofOfPossession: async (
    deviceName: string,
    proofOfPossession: string
  ): Promise<boolean> => {
    try {
      const status = await ESPProvModule.setProofOfPossession(
        deviceName,
        proofOfPossession
      );
      return status;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Initializes a session with the ESP device.
   *
   * @param {string} deviceName - The name of the ESP device.
   * @returns {Promise<boolean>} - A promise that resolves to whether the session initialization was successful.
   */
  initializeSession: async (deviceName: string): Promise<boolean> => {
    try {
      const status = await ESPProvModule.initializeSession(deviceName);
      return status;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Creates an ESP device instance with the specified parameters.
   *
   * @param {string} deviceName - The name of the ESP device.
   * @param {string} transport - The transport type (BLE or Wi-Fi).
   * @param {number} [security] - The security level.
   * @param {string} [proofOfPossession] - The Proof of Possession.
   * @param {string} [softAPPassword] - The password for SoftAP.
   * @param {string} [username] - The username for the device.
   * @returns {Promise<ESPDeviceInterface>} - A promise that resolves to the created ESP device instance.
   */
  createESPDevice: async (
    deviceName: string,
    transport: string,
    security?: number,
    proofOfPossession?: string,
    softAPPassword?: string,
    username?: string
  ): Promise<ESPDeviceInterface> => {
    try {
      const nativeDevice = await ESPProvModule.createESPDevice(
        deviceName,
        transport,
        security,
        proofOfPossession,
        softAPPassword,
        username
      );
      return nativeDevice;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves the capabilities of the specified ESP device.
   *
   * @param {string} deviceName - The name of the ESP device.
   * @returns {Promise<string[]>} - A promise that resolves to a list of device capabilities.
   */
  getDeviceCapabilities: async (deviceName: string): Promise<string[]> => {
    try {
      const deviceCapabilities: string[] =
        await ESPProvModule.getDeviceCapabilities(deviceName);
      return deviceCapabilities;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Stop the ESP devices search.
   */
  stopESPDevicesSearch: async () => {
    // TO-DO:
    console.log("Stop the ESP devices search.");
  },

  /**
   * Disconnects the specified ESP device.
   *
   * @param {string} deviceName - The name of the ESP device to disconnect.
   */
  disconnect: async (deviceName: string) => {
    try {
      await ESPProvModule.disconnect(deviceName);
    } catch (error) {
      console.error("[ESPProvAdapter] Error disconnecting device:", error);
    }
  },

  /**
   * Retrieves the version information of the specified ESP device.
   *
   * @param {string} deviceName - The name of the ESP device.
   * @returns {Promise<{ [key: string]: any }>} - A promise that resolves to the version information.
   */
  getDeviceVersionInfo: async (
    deviceName: string
  ): Promise<{ [key: string]: any }> => {
    try {
      const versionInfo = await ESPProvModule.getDeviceVersionInfo(deviceName);
      return versionInfo;
    } catch (error) {
      throw error;
    }
  },
};
