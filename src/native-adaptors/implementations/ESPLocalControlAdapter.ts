/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPLocalControlAdapterInterface } from "@store";
import ESPLocalControlModule, {
  type ESPLocalControlSessionOptions,
} from "../interfaces/ESPLocalControlInterface";

export type { ESPLocalControlSessionOptions };

const ESPLocalControlAdapter: ESPLocalControlAdapterInterface & {
  /** Evicts the native module's cached session/credentials for a node. */
  disconnect: (nodeId: string) => Promise<void>;
  /** Widened `connect` accepting the protocol's session endpoints. */
  connect: (
    nodeId: string,
    baseurl: string,
    securityType: number,
    pop?: string,
    username?: string,
    options?: ESPLocalControlSessionOptions
  ) => Promise<Record<string, any>>;
} = {
  /**
   * Checks if a device with the given node ID is connected locally.
   * @param nodeId - The unique identifier of the device.
   * @returns - Resolves to `true` if the device is connected, `false` otherwise.
   * @throws {Error} - Throws an error if the check fails.
   */
  isConnected: async (nodeId: string): Promise<boolean> => {
    try {
      const res = await ESPLocalControlModule.isConnected(nodeId);
      return res;
    } catch (error) {
      console.error("[ESPLocalControlAdapter][isConnected] error", nodeId, String(error));
      throw error;
    }
  },

  /**
   * Establishes a connection with the ESP device using the specified parameters.
   * @param nodeId - The unique identifier of the device.
   * @param baseurl - The base URL of the device (including IP address and port).
   * @param securityType - The security type (0: None, 1: Security1, 2: Security2).
   * @param [pop] - The proof of possession for secure connections (optional).
   * @param [username] - The username for Security2 authentication (optional).
   * @param [options] - Protocomm endpoints selecting the local-control protocol
   *   (see {@link ESPLocalControlSessionOptions}). When omitted, the native
   *   module falls back to its legacy `esp_local_ctrl` endpoints.
   * @returns - Resolves with a record containing connection details on success.
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
    username?: string,
    options?: ESPLocalControlSessionOptions
  ): Promise<Record<string, any>> => {
    try {
      const _username = username ?? (securityType === 2 ? "wifiprov" : "");
      const res = await ESPLocalControlModule.connect(
        nodeId,
        baseurl,
        securityType,
        pop,
        _username,
        options ?? null
      );
      return res;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Sends data to the connected ESP device at the specified path.
   * @param nodeId - The unique identifier of the device.
   * @param path - The endpoint path to which data will be sent.
   * @param data - The data to send, encoded as a Base64 string.
   * @returns - Resolves with the response from the device, encoded as a Base64 string.
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

  /**
   * Drops the native module's cached session/credentials for a node so the next
   * `connect()` performs a fresh handshake. Best-effort: older native builds
   * without `disconnect` are a no-op. Used to recover from a stale PoP/IP after
   * a factory-reset + re-provision, or when the node drops off mDNS.
   * @param nodeId - The unique identifier of the device.
   */
  disconnect: async (nodeId: string): Promise<void> => {
    try {
      const native = ESPLocalControlModule as unknown as {
        disconnect?: (nodeId: string) => void;
      };
      native.disconnect?.(nodeId);
    } catch (error) {
      // Best-effort cache invalidation; never block discovery teardown.
      console.log("[localCtrl][DIAG] disconnect error", nodeId, String(error));
    }
  },
};

export default ESPLocalControlAdapter;
