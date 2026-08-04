/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFProvisioningDevice,
  ESPCDFProvisioningDeviceInterface,
  ESPCDFProvisioningDeviceOperations,
} from "@store";
import { ClaimCapabilities, ESPDevice } from "@espressif/rainmaker-neo-base-sdk";
import { checkChallengeResponseCapability } from "../utils/helpers/provisionHelpers";
import {
  ESPRMNEO_PROVISION_CONNECT_SUCCESS_CODE,
  ESPRMNEO_PROVISION_DEFAULT_SECURITY,
  ESPRMNEO_PROVISION_ERR_INITIATE_USER_NODE_MAPPING,
  ESPRMNEO_PROVISION_ERR_SET_NETWORK_CREDENTIALS,
  ESPRMNEO_PROVISION_ERR_VERIFY_USER_NODE_MAPPING,
  ESPRMNEO_PROVISION_LOG_CHAL_RESP_FLOW,
  ESPRMNEO_PROVISION_LOG_CHAL_RESP_SUPPORT,
  ESPRMNEO_PROVISION_LOG_CONNECT,
  ESPRMNEO_PROVISION_LOG_DISCONNECT,
  ESPRMNEO_PROVISION_LOG_VERSION_INFO_SKIP,
  ESPRMNEO_PROVISION_LOG_WIFI_OK,
  ESPRMNEO_PROVISION_LOG_WIFI_RESET,
  ESPRMNEO_PROVISION_LOG_WIFI_RETRY,
  ESPRMNEO_PROVISION_TRANSPORT_BLE,
} from "../utils/constants";
import { Logger } from "../utils/logger";

/**
 * Device descriptor fields optionally present on the SDK `ESPDevice`
 * (e.g. from searchESPDevices / createESPDevice).
 */
export interface AdapterDeviceDescriptor {
  name: string;
  transport?: string;
  security?: number;
  connected?: boolean;
  username?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches CDF / SDK untyped descriptor fields
  versionInfo?: Record<string, any>;
  capabilities?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- advertisement payload shape is SDK-defined
  advertisementData?: { [key: string]: any }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- open descriptor bag from search/create
  [key: string]: any;
}

/**
 * Builds an `ESPCDFProvisioningDevice` from an RMNeo `ESPDevice`.
 *
 * Operations mostly delegate to the SDK device; claiming / assisted-claiming
 * paths that RMNeo does not support on the device object throw with guidance
 * to use group association APIs instead.
 * @param device - RMNeo BLE/SoftAP provision device from search or create.
 * @returns CDF provisioning device with wired operations and `_raw` SDK handle.
 */
export function createCDFProvisioningDevice(
  device: ESPDevice,
): ESPCDFProvisioningDevice {
  const operations: ESPCDFProvisioningDeviceOperations = {
    /**
     * Opens a session to the physical device over the configured transport.
     * @returns `true` when the SDK connect status code is success.
     */
    async connect(): Promise<boolean> {
      const response = await device.connect();
      const ok = response === ESPRMNEO_PROVISION_CONNECT_SUCCESS_CODE;
      Logger.log(ESPRMNEO_PROVISION_LOG_CONNECT, {
        name: device.name,
        ok,
        code: response,
      });
      return ok;
    },

    /**
     * Closes the active session with the physical device.
     */
    async disconnect(): Promise<void> {
      await device.disconnect();
      Logger.log(ESPRMNEO_PROVISION_LOG_DISCONNECT, { name: device.name });
    },

    /**
     * Reads capability strings advertised by the device.
     * @returns Capability list from the SDK.
     */
    async getDeviceCapabilities(): Promise<string[]> {
      return device.getDeviceCapabilities();
    },

    /**
     * Fetches the device version / proto-ver payload.
     * @returns Version info map from the SDK.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF operation signature
    async getDeviceVersionInfo(): Promise<Record<string, any>> {
      return device.getDeviceVersion();
    },

    /**
     * Stores the proof-of-possession string used for the secure session.
     * @param pop - Proof-of-possession value.
     * @returns Whether the SDK accepted the PoP.
     */
    async setProofOfPossession(pop: string): Promise<boolean> {
      return device.setProofOfPossession(pop);
    },

    /**
     * Establishes the encrypted provisioning session after connect + PoP.
     * @returns Whether session init succeeded.
     */
    async initializeSession(): Promise<boolean> {
      return device.initializeSession();
    },

    /**
     * Scans Wi-Fi networks visible to the device.
     * @returns List of scanned networks from the SDK.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF operation signature
    async scanWifiList(): Promise<any[]> {
      return device.scanWifiList();
    },

    /**
     * Runs Wi-Fi (and optional challenge-response) provision on the device.
     * @param ssid - Target Wi-Fi SSID.
     * @param password - Target Wi-Fi password.
     * @param onProgress - Optional progress callback from the SDK.
     * @param groupId - Home/group id used for challenge-response association.
     * @param provisionType - SDK provision type (e.g. chal-resp).
     * @param options - Extra SDK provision options (user, waitForOnline, …).
     */
    async provision(
      ssid: string,
      password: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF progress callback
      onProgress?: (response: any) => void,
      groupId?: string,
      provisionType?: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF options bag
      options?: Record<string, any>,
    ): Promise<void> {
      let supportsChalResp = false;
      try {
        const versionInfo = await device.getDeviceVersion();
        supportsChalResp = checkChallengeResponseCapability(versionInfo);
      } catch {
        Logger.warn(ESPRMNEO_PROVISION_LOG_VERSION_INFO_SKIP, {
          name: device.name,
        });
      }

      if (supportsChalResp && groupId) {
        Logger.log(ESPRMNEO_PROVISION_LOG_CHAL_RESP_FLOW, {
          name: device.name,
          groupId,
        });
      }

      const progress = onProgress ?? (() => {});
      const gid = groupId ?? "";
      await device.provision(
        ssid,
        password,
        progress,
        gid,
        provisionType,
        options,
      );
      Logger.log(ESPRMNEO_PROVISION_LOG_WIFI_OK, { name: device.name });
    },

    /**
     * Clears the device's Wi-Fi state over the open provisioning session.
     * @returns `true` when the device acknowledged the reset.
     */
    async resetWifiStatus(): Promise<boolean> {
      Logger.log(ESPRMNEO_PROVISION_LOG_WIFI_RESET, { name: device.name });
      return device.resetWifiStatus();
    },

    /**
     * Re-sends Wi-Fi credentials after a reset, resuming the association the
     * first attempt established. SSID is logged; the password never is.
     * @param ssid - SSID, unchanged from the first attempt.
     * @param password - The corrected Wi-Fi password.
     * @param onProgress - Progress callback; emits the same messages as provision.
     */
    async retryNetworkCredentials(
      ssid: string,
      password: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF progress callback
      onProgress?: (response: any) => void,
    ): Promise<void> {
      Logger.log(ESPRMNEO_PROVISION_LOG_WIFI_RETRY, {
        name: device.name,
        ssid,
      });
      const nodeId = await device.retryNetworkCredentials(
        ssid,
        password,
        onProgress ?? (() => {}),
      );
      // The SDK returns the node id; re-emit it in the shape the flow reads.
      onProgress?.({ status: "succeed", description: nodeId, data: { nodeId } });
    },

    /**
     * Not supported on RMNeo adapter-created devices — use group association.
     * @param _params - Ignored mapping params.
     * @throws Always throws {@link ESPRMNEO_PROVISION_ERR_INITIATE_USER_NODE_MAPPING}.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF operation signature
    async initiateUserNodeMapping(_params?: Record<string, any>): Promise<any> {
      throw new Error(ESPRMNEO_PROVISION_ERR_INITIATE_USER_NODE_MAPPING);
    },

    /**
     * Not supported on RMNeo adapter-created devices — use group association.
     * @param _params - Ignored mapping params.
     * @throws Always throws {@link ESPRMNEO_PROVISION_ERR_VERIFY_USER_NODE_MAPPING}.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF operation signature
    async verifyUserNodeMapping(_params: any): Promise<any> {
      throw new Error(ESPRMNEO_PROVISION_ERR_VERIFY_USER_NODE_MAPPING);
    },

    /**
     * Not supported on RMNeo adapter-created devices.
     * @param _ssid - Ignored SSID.
     * @param _password - Ignored password.
     * @throws Always throws {@link ESPRMNEO_PROVISION_ERR_SET_NETWORK_CREDENTIALS}.
     */
    async setNetworkCredentials(
      _ssid: string,
      _password: string,
    ): Promise<number> {
      throw new Error(ESPRMNEO_PROVISION_ERR_SET_NETWORK_CREDENTIALS);
    },

    /**
     * Sends a raw string payload to a device endpoint during the session.
     * @param endPoint - Device endpoint name.
     * @param data - Payload string.
     * @returns SDK response string.
     */
    async sendData(endPoint: string, data: string): Promise<string> {
      return device.sendData(endPoint, data);
    },

    /**
     * Performs Assisted Claiming.
     * @param onProgress - progress callback.
     * @param claimCapability - claim capability.
     */
    async startAssistedClaiming(
      onProgress?: (response: any) => void,
      claimCapability?: string,
    ): Promise<void> {
      await device.startAssistedClaiming(onProgress, claimCapability as ClaimCapabilities);
    },

    /**
     * Checks whether the device advertises challenge-response capability.
     * @returns `true` when `rmaker_extra.cap` includes `ch_resp`.
     */
    async checkChallengeResponseSupport(): Promise<boolean> {
      const versionInfo = await device.getDeviceVersion();
      const supported = checkChallengeResponseCapability(versionInfo);
      Logger.log(ESPRMNEO_PROVISION_LOG_CHAL_RESP_SUPPORT, {
        name: device.name,
        supported,
      });
      return supported;
    },
  };

  const deviceData: ESPCDFProvisioningDeviceInterface = {
    name: device.name,
    transport: device.transport ?? ESPRMNEO_PROVISION_TRANSPORT_BLE,
    security: device.security ?? ESPRMNEO_PROVISION_DEFAULT_SECURITY,
    connected: false,
    username: "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF default before version fetch
    versionInfo: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF default before capabilities fetch
    capabilities: [] as any,
    advertisementData:
      (device as unknown as AdapterDeviceDescriptor).advertisementData ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDF empty advertisement default
      ([] as any),
    operations,
    _raw: device,
  };

  return new ESPCDFProvisioningDevice(deviceData);
}
