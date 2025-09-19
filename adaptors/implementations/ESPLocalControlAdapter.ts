/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPLocalControlAdapterInterface } from "@espressif/rainmaker-base-sdk";
import ESPLocalControlModule from "../interfaces/ESPLocalControlInterface";

const ESPLocalControlAdapter: ESPLocalControlAdapterInterface = {
  /**
   * Checks if a device with the given node ID is connected locally.
   *
   * @param {string} nodeId - The unique identifier of the device.
   * @returns {Promise<boolean>} - Resolves to `true` if the device is connected, `false` otherwise.
   * @throws {Error} - Throws an error if the check fails.
   */
  isConnected: async (nodeId: string): Promise<boolean> => {
    try {
      const res = await ESPLocalControlModule.isConnected(nodeId);
      return res;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Establishes a connection with the ESP device using the specified parameters.
   *
   * @param {string} nodeId - The unique identifier of the device.
   * @param {string} baseurl - The base URL of the device (including IP address and port).
   * @param {number} securityType - The security type (0: None, 1: Security1, 2: Security2).
   * @param {string} [pop] - The proof of possession for secure connections (optional).
   * @param {string} [username] - The username for Security2 authentication (optional).
   * @returns {Promise<Record<string, any>>} - Resolves with a record containing connection details on success.
   * @throws {Error} - Throws an error if the connection fails.
   *
   * Notes:
   * - If `username` is not provided and `securityType` is 2, a default username `wifiprov` is used.
   */
  connect: async (
    nodeId: string,
    baseurl: string,
    securityType: number,
    pop?: string,
    username?: string
  ): Promise<Record<string, any>> => {
    try {
      let _username;
      if (!username) {
        _username = securityType === 2 ? "wifiprov" : "";
      }
      const res = await ESPLocalControlModule.connect(
        nodeId,
        baseurl,
        securityType,
        pop,
        _username
      );
      return res;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Sends data to the connected ESP device at the specified path.
   *
   * @param {string} nodeId - The unique identifier of the device.
   * @param {string} path - The endpoint path to which data will be sent.
   * @param {string} data - The data to send, encoded as a Base64 string.
   * @returns {Promise<string>} - Resolves with the response from the device, encoded as a Base64 string.
   * @throws {Error} - Throws an error if the data transmission fails.
   */
  sendData: async (
    nodeId: string,
    path: string,
    data: string
  ): Promise<string> => {
    try {
      const res = await ESPLocalControlModule.sendData(nodeId, path, data);
      return res;
    } catch (error) {
      throw error;
    }
  },
};

export default ESPLocalControlAdapter;
