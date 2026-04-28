/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Transport types for device provisioning
 */
export enum ESPCDFTransport {
  BLE = "ble",
  SOFTAP = "softap",
}

/**
 * Security types for device provisioning
 */
export enum ESPCDFSecurity {
  SECURITY_0 = 0,
  SECURITY_1 = 1,
  SECURITY_2 = 2,
}

/**
 * WiFi network information
 */
export interface ESPCDFWifiNetwork {
  ssid: string;
  rssi: number;
  secure: boolean;
  auth: number;
  bssid?: string;
  channel?: number;
}

/**
 * Represents the status of a claiming operation.
 */
export enum ESPCDFClaimStatus {
  /** Claiming in progress */
  inProgress = "inProgress",
  /** Claiming succeeded */
  success = "success",
  /** Claiming failed */
  failed = "failed",
  /** Claiming was aborted */
  aborted = "aborted",
}
export interface ESPCDFClaimResponse {
  /** Current status of the claiming operation */
  status: ESPCDFClaimStatus;
  /** Progress message description */
  message: string;
  /** Optional error information */
  error?: string;
}

/**
 * Callback type for claiming progress updates.
 */
export type ESPCDFClaimProgressCallback = (response: ESPCDFClaimResponse) => void;
/**
 * Device version information
 */
export type ESPCDFProvisionProgressCallback = (
  response: ESPCDFProvisionResponse
) => void;

/**
 * Provisioning response status
 */
export enum ESPCDFProvisionResponseStatus {
  SUCCEED = "succeed",
  ON_PROGRESS = "onProgress",
  FAILED = "failed",
}

/**
 * Provisioning response
 */
export interface ESPCDFProvisionResponse {
  status: ESPCDFProvisionResponseStatus;
  description?: string;
  data?: Record<string, any>;
}

/**
 * Provisioning status
 */
export enum ESPCDFProvisionStatus {
  SUCCESS = 0,
  FAILURE = 1,
}

/**
 * User-Node mapping response for challenge-response flow
 * Note: API returns snake_case parameter names
 */
export interface ESPCDFUserNodeMappingResponse {
  challenge?: string;
  request_id?: string;
  status?: string;
  [key: string]: any;
}

/**
 * Challenge-response verification request
 * Note: API expects snake_case parameter names
 */
export interface ESPCDFChallengeResponseVerificationRequest {
  request_id: string;
  challenge_response: string;
  node_id: string;
  group_id?: string;
  [key: string]: any;
}

/**
 * On-network device discovered via mDNS (Bonjour / NSD).
 *
 * Captures everything required to talk to the device directly over LAN HTTP
 * for the on-network challenge-response provisioning flow:
 * - `host`/`port`: numeric IP and TCP port the device advertises.
 * - `popRequired`: true if the device demands a Proof-of-Possession before
 *   it will accept a challenge.
 * - `secVersion`: security version advertised in TXT records (typically 0/1/2).
 * - `chRespEndpoint`: HTTP path under which the device exposes its
 *   challenge-response handler (defaults to `ch_resp`).
 * - `nodeId`: stable identifier the device announces (TXT `node_id` or service
 *   instance name fallback). Already known to RainMaker cloud.
 * - `serviceName`: raw mDNS service instance name (used as a display label).
 */
export interface ESPCDFOnNetworkDevice {
  /** RainMaker node id advertised in TXT `node_id`. */
  nodeId: string;
  /** Service instance name (display fallback when `nodeId` is technical). */
  serviceName: string;
  /** Numeric host (e.g. `192.168.1.42`). */
  host: string;
  /** TCP port advertised by the service. */
  port: number;
  /** Security version from TXT `sec_version` (defaults to 0 if missing). */
  secVersion: number;
  /** Whether the device requires a POP before accepting the challenge. */
  popRequired: boolean;
  /** HTTP path on the device for challenge-response (defaults to `ch_resp`). */
  chRespEndpoint: string;
}

/**
 * Parameters for `user.addOnNetworkDevice` (challenge-response over LAN HTTP).
 *
 * No Wi-Fi credentials are required — the device is already on the network;
 * provisioning only performs cloud-driven user-node mapping verified through
 * a signed challenge.
 */
export interface AddOnNetworkDeviceParams {
  /** Discovered mDNS device record. */
  device: ESPCDFOnNetworkDevice;
  /** Group / home id to attach the node to once verified. */
  groupId: string;
  /** Optional POP value; required when `device.popRequired` is true. */
  pop?: string;
  /** Optional progress callback (mirrors `addDevice`). */
  onProgress?: (response: ESPCDFProvisionResponse) => void;
}

/**
 * Provisioning device interface - represents a device during provisioning
 * This interface unifies device provisioning across different SDKs
 */
export interface ESPCDFProvisioningDeviceInterface {
  /** Device name/identifier */
  name: string;
  /** Transport type (BLE or SoftAP) */
  transport: string;
  /** Security level */
  security: number;
  /** Connection status */
  connected?: boolean;
  /** Username for device connection */
  username?: string;
  /** Device version information — array of version objects as returned by the SDK */
  versionInfo?: { [key: string]: any }[];
  /** Device capabilities */
  capabilities?: string[];
  /** BLE advertisement data (for BLE devices) */
  advertisementData?: { [key: string]: any }[];
  /** Provisioning device operations */
  operations: ESPCDFProvisioningDeviceOperations;
  /** Raw device data from SDK */
  _raw?: any;
}

export type ESPDeviceInterface = ESPCDFProvisioningDeviceInterface;
export type ESPProvisionStatus = 0 | 1;
export type ESPWifiList = ESPCDFWifiNetwork;
export type ESPTransport = ESPCDFTransport | string;
export type ESPConnectStatus = 0 | 1;

/**
 * Provisioning device operations interface
 * Defines all methods available on a provisioning device
 */
export interface ESPCDFProvisioningDeviceOperations {
  /**
   * Connect to the device
   * @returns Promise resolving to connection status
   */
  connect(): Promise<boolean>;

  /**
   * Disconnect from the device
   * @returns Promise resolving when disconnected
   */
  disconnect(): Promise<void>;

  /**
   * Get device capabilities
   * @returns Promise resolving to array of capability strings
   */
  getDeviceCapabilities(): Promise<string[]>;

  /**
   * Get device version information
   * @returns Promise resolving to version info object
   */
  getDeviceVersionInfo(): Promise<Record<string, any>>;

  /**
   * Set proof of possession (POP) code
   * @param pop - The POP code string
   * @returns Promise resolving to boolean indicating success
   */
  setProofOfPossession(pop: string): Promise<boolean>;

  /**
   * Initialize session with the device
   * @returns Promise resolving to boolean indicating success
   */
  initializeSession(): Promise<boolean>;

  /**
   * Scan for available WiFi networks
   * @returns Promise resolving to array of WiFi networks
   */
  scanWifiList(): Promise<ESPCDFWifiNetwork[]>;

  /**
   * Provision device with WiFi credentials (traditional flow)
   * @param ssid - WiFi SSID
   * @param password - WiFi password
   * @param onProgress - Optional progress callback
   * @param homeId - Optional home/group ID for node association
   * @param provisionType - Optional provision type (challenge-response or mqtt)
   * @returns Promise resolving when provisioning completes
   */
  provision(
    ssid: string,
    password: string,
    onProgress?: ESPCDFProvisionProgressCallback,
    homeId?: string,
    provisionType?: string
  ): Promise<void>;

  /**
   * Initiate user-node mapping (challenge-response flow)
   * @param params - Optional parameters
   * @returns Promise resolving to mapping response with challenge
   */
  initiateUserNodeMapping(
    params?: Record<string, any>
  ): Promise<ESPCDFUserNodeMappingResponse>;

  /**
   * Verify user-node mapping (challenge-response flow)
   * @param params - Verification parameters including requestId, challengeResponse, nodeId
   * @returns Promise resolving to verification response
   */
  verifyUserNodeMapping(
    params: ESPCDFChallengeResponseVerificationRequest
  ): Promise<ESPCDFUserNodeMappingResponse>;

  /**
   * Set network credentials directly (for challenge-response flow)
   * @param ssid - WiFi SSID
   * @param password - WiFi password
   * @returns Promise resolving to status code (0 = success)
   */
  setNetworkCredentials(ssid: string, password: string): Promise<number>;

  /**
   * Send data to the device
   * @param endPoint - End point
   * @param data - Data to send
   * @returns Promise resolving to the response
   */
  sendData(endPoint: string, data: string): Promise<string>;

  /**
   * Start assisted claiming
   * @param onProgress - Optional progress callback
   * @param claimCapability - Optional claim capability
   * @returns Promise resolving when claiming completes
   */
  startAssistedClaiming(
    onProgress?: Function,
    claimCapability?: string
  ): Promise<void>
  /**
   * Check if challenge-response support is available
   * @returns Promise resolving to boolean indicating support
   */
  checkChallengeResponseSupport(): Promise<boolean>;

  /**
   * Check whether this device represents an "on-network" target (already on
   * the user's Wi-Fi, discovered via mDNS). Used by `useProvision` to pick
   * the LAN-HTTP challenge-response flow vs. the BLE/SoftAP Wi-Fi flow —
   * same dispatch pattern as `checkChallengeResponseSupport` for chal-resp
   * vs. MQTT.
   *
   * Optional: adaptors / device transformers that don't construct on-network
   * provisioning devices may omit this method; the entity wrapper defaults
   * to `false`.
   * @returns Promise resolving to `true` for on-network devices, `false` otherwise.
   */
  checkOnNetworkProvisioning?(): Promise<boolean>;
}

/**
 * Provisioning adapter interface exposed by native module bridge.
 */
export interface ESPCDFProvisionAdapterInterface {
  searchESPDevices(
    devicePrefix: string,
    transport: ESPTransport
  ): Promise<ESPDeviceInterface[]>;
  connect(deviceName: string): Promise<ESPConnectStatus>;
  sendData(deviceName: string, endPoint: string, data: string): Promise<string>;
  scanWifiList(deviceName: string): Promise<ESPWifiList[]>;
  provision(
    deviceName: string,
    ssid: string,
    passphrase: string
  ): Promise<ESPProvisionStatus>;
  setProofOfPossession(
    deviceName: string,
    proofOfPossession: string
  ): Promise<boolean>;
  initializeSession(deviceName: string): Promise<boolean>;
  createESPDevice(
    deviceName: string,
    transport: string,
    security?: number,
    proofOfPossession?: string,
    softAPPassword?: string,
    username?: string
  ): Promise<ESPDeviceInterface>;
  getDeviceCapabilities(deviceName: string): Promise<string[]>;
  stopESPDevicesSearch(): Promise<void>;
  disconnect(deviceName: string): Promise<void>;
  getDeviceVersionInfo(deviceName: string): Promise<Record<string, any>>;
}

export type ESPProvisionAdapterInterface = ESPCDFProvisionAdapterInterface;

/**
 * Represents the status of the provisioning response.
 */
export declare enum ESPCDFProvResponseStatus {
  onProgress = "onProgress",
  succeed = "succeed"
}

/**
 * Represents the response received after provisioning.
 */
export interface ESPCDFProvResponse {
  status: ESPCDFProvResponseStatus;
  description?: string;
  data?: Record<string, any>;
}

/**
 * An object containing ESPCDF provisioning progress messages.
 */
export const ESPCDFProvProgressMessages = {
  /** Message indicating the start of user device association. */
  START_ASSOCIATION: "Starting user device association...",
  /** Message indicating the association config request creation. */
  ASSOCIATION_CONFIG_CREATED: "Association config request created.",
  /** Message indicating the sending of association config request. */
  SENDING_ASSOCIATION_CONFIG:
    "Sending association config request to 'cloud_user_assoc' endPoint.",
  /** Message indicating the successful sending of association config request. */
  ASSOCIATION_CONFIG_SENT:
    "Association config request sent successfully to 'cloud_user_assoc' endPoint.",
  /** Message indicating the successful device provisioning. */
  DEVICE_PROVISIONED: "Succeed device provisioning",
  /** Message indicating the successful user node mapping. */
  USER_NODE_MAPPING_SUCCEED: "User node mapping succeed",
  /** Message indicating the decoding of response data. */
  DECODING_RESPONSE_DATA: "Decoding response data",
  /** Message indicating the successful decoding of NodeId from response data. */
  DECODED_NODE_ID: "Decoded NodeId from response data successfully",
  /** Message indicating the node timeZone setup process initiation. */
  INITIATING_NODE_TIMEZONE_SETUP: "Initiating node timezone setup",
  /** Message indicating the setting of node timeZone. */
  SETTING_NODE_TIMEZONE: "Setting node timezone",
  /** Message indicating the successful node timeZone setup. */
  NODE_TIMEZONE_SETUP_SUCCEED: "Node timezone setup succeed",
} as const;

/**
 * Progress messages emitted during the on-network (LAN HTTP)
 * challenge-response provisioning flow.
 */
export const ESPCDFOnNetworkProgressMessages = {
  /** Cloud is being asked to issue a challenge for the discovered node. */
  INITIATING_NODE_ASSOCIATION: "Initiating node association",
  /** Challenge has been issued and is being relayed to the device. */
  SENDING_CHALLENGE_TO_DEVICE: "Sending challenge to device",
  /** Cloud is verifying the signed challenge returned by the device. */
  VERIFYING_NODE_ASSOCIATION: "Verifying node association",
  /** Mapping has been confirmed by the cloud. */
  USER_NODE_MAPPING_SUCCEED: "User node mapping succeed",
} as const;