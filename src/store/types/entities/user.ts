/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFAPIResponse,
  ESPCDFPaginatedAPIResponse,
  ESPCDFAPIDataResponse,
} from "../../types";
import type { GroupStoreCallbacks } from "../callbacks";
import type {
  ESPCDFProvisionResponse,
  AddOnNetworkDeviceParams,
} from "../provision";
import { ESPCDFGroup } from "../../entities/ESPCDFGroup";
import { ESPCDFGroupSharingRequest } from "../../entities/ESPCDFGroupSharingRequest";
import { ESPCDFNode } from "../../entities/ESPCDFNode";
import { ESPCDFProvisioningDevice } from "../../entities/ESPCDFProvisioningDevice";

/**
 * Operation types that can trigger callbacks
 */
export type ESPCDFUserOperationType =
  | "getUserInfo"
  | "updateUserInfo"
  | "getCustomData"
  | "setCustomData"
  | "changePassword"
  | "updateName"
  | "requestAccountDeletion"
  | "confirmAccountDeletion"
  | "registerForNotification"
  | "unregisterForNotification"
  | "getIssuedGroupSharingRequests"
  | "getReceivedGroupSharingRequests"
  | "removeGroupSharingRequest"
  | "logout"
  | "setTimeZone"
  | "createGroup"
  | "getGroups"
  | "getNodeDetails"
  | "syncHomeWithNodes"
  | "setCurrentHome"
  | "createHome"
  | "addDevice"
  | "addOnNetworkDevice"
  | "subscribeToNodeUpdates"
  | "unsubscribeFromNodeUpdates"
  | "getGroupsAndFabrics"
  | "prepareFabricForMatterCommissioning";

export interface ESPCDFUserInfo {
  id: string;
  name: string;
  email: string;
  nickname?: string;
  phone?: string;
  [key: string]: any;
}
export interface ESPCDFUserOperation {
  getUserInfo(): Promise<ESPCDFAPIDataResponse<ESPCDFUserInfo>>;
  updateUserInfo(userInfo: Partial<ESPCDFUserInfo>): Promise<ESPCDFAPIResponse>;
  getCustomData(): Promise<any>;
  setCustomData(customData: ESPCDFUserCustomDataRequest): Promise<void>;
  changePassword(
    oldPassword: string,
    newPassword: string
  ): Promise<ESPCDFAPIResponse>;
  logout(): Promise<void>;
  updateName(name: string): Promise<ESPCDFAPIResponse>;
  requestAccountDeletion(): Promise<ESPCDFAPIResponse>;
  confirmAccountDeletion(code: string): Promise<ESPCDFAPIResponse>;
  registerForNotification(
    platform: string,
    deviceToken: string
  ): Promise<ESPCDFAPIDataResponse>;
  unregisterForNotification(deviceToken: string): Promise<ESPCDFAPIResponse>;
  getIssuedGroupSharingRequests(
    count?: number
  ): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>>;
  getReceivedGroupSharingRequests(
    count?: number
  ): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>>;
  setTimeZone(timeZone: string): Promise<ESPCDFAPIResponse>;
  createGroup(groupRequest: ESPCDFCreateGroupRequest): Promise<ESPCDFGroup>;
  getGroups(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>>;
  // Provisioning operations - unified interface
  createProvisioningDevice(
    name: string,
    transport: string,
    security?: number,
    proofOfPossession?: string,
    softAPPassword?: string,
    username?: string
  ): Promise<any>;
  searchESPDevices(prefix: string, transport: string): Promise<any[]>;
  searchESPBLEDevices(customerId: number): Promise<any[]>;
  getGroupById(groupId: string, options: Record<string, any>): Promise<any>;
  subscribeToEvent(event: string, callback: (data: any) => void): Promise<any>;
  unsubscribeFromEvent(
    event: string,
    callback: (data: any) => void
  ): Promise<any>;
  setMultipleNodesParams(
    payload: { nodeId: string; payload: any }[]
  ): Promise<ESPCDFAPIResponse>;
  getNodeDetails(nodeId: string): Promise<ESPCDFNode>;
  getAccessToken(): Promise<string>;
  syncHomeWithNodes?(
    user: ESPCDFUserInterface,
    callbacks: GroupStoreCallbacks
  ): Promise<ESPCDFGroup | null>;
  setCurrentHome?(
    user: ESPCDFUserInterface,
    callbacks: GroupStoreCallbacks,
    home: ESPCDFGroup
  ): Promise<void>;
  createHome?(
    params: ESPCDFCreateHomeRequestParams,
    callbacks: GroupStoreCallbacks
  ): Promise<ESPCDFGroup>;
  addDevice?(
    user: ESPCDFUserInterface,
    params: AddDeviceParams,
    callbacks: GroupStoreCallbacks
  ): Promise<ESPCDFNode | null>;
  /**
   * Add a device that is already on the user's local network using the
   * challenge-response flow over LAN HTTP. No Wi-Fi credentials are required.
   * Optional: adaptors that do not implement on-network provisioning may omit it.
   */
  addOnNetworkDevice?(
    user: ESPCDFUserInterface,
    params: AddOnNetworkDeviceParams,
    callbacks: GroupStoreCallbacks
  ): Promise<ESPCDFNode | null>;
  /**
   * Subscribe to node updates via the SDK subscription manager (e.g. notification channel).
   * Updates are forwarded to the CDF subscription store.
   */
  subscribeToNodeUpdates?(params: ESPCDFSubscribeToNodeUpdatesRequestParams): Promise<void>;
  /**
   * Unsubscribe from node updates and release subscription manager resources.
   */
  unsubscribeFromNodeUpdates?(): Promise<void>;

  /**
   * Obtain short-lived AWS credentials scoped to the requested role/resources.
   * Optional: adaptors that do not support this operation may omit it.
   */
  assumeRole?(request: ESPCDFAssumeRoleRequest): Promise<ESPCDFAssumeRoleResponse>;

  // Optional Matter commissioning operations
  getGroupsAndFabrics?(): Promise<ESPCDFGroup[]>;
  prepareFabricForMatterCommissioning?(
    group: ESPCDFGroup
  ): Promise<ESPCDFGroup>;
  isUserNocAvailableForFabric?(fabricId: string): Promise<boolean>;
  storePrecommissionInfo?(
    info: ESPCDFMatterPrecommissionInfo
  ): Promise<void>;
}

export interface ESPCDFSubscribeToNodeUpdatesRequestParams {
  nodeList: ESPCDFNode[];
  onNodeUpdate?: (update: Record<string, any>) => void;
  extraPayload?: Record<string, any>;
}
/**
 * Parameters for creating a home via user.createHome
 */
export interface ESPCDFCreateHomeRequestParams {
  /** Display name for the home; if omitted, a unique default name is used */
  name: string;
  /** Node IDs to include in the home */
  nodeIds?: string[];
  /** Extra payload to include in the home creation request */
  extraPayload?: Record<string, any>;
}

/**
 * Parameters for adding a device via user.addDevice
 */
export interface AddDeviceParams {
  provisioningDevice: ESPCDFProvisioningDevice;
  groupId: string;
  deviceName?: string;
  ssid: string;
  password: string;
  onProgress?: (response: ESPCDFProvisionResponse) => void;
}

/**
 * SDK-agnostic request payload for the assume-role operation.
 */
export interface ESPCDFAssumeRoleRequest {
  /** The role to assume */
  userRole?: string;
  /** The group IDs to assume the role for */
  groupIds?: string[];
  /** The node IDs to assume the role for */
  nodeIds?: string[];
  /** Extra payload to include in the assume-role request */
  extraPayload?: Record<string, any>;
}

/**
 * SDK-agnostic response returned by the assume-role operation.
 * Contains short-lived AWS credentials for accessing cloud resources.
 */
export interface ESPCDFAssumeRoleResponse {
  accessKey: string;
  secretKey: string;
  sessionToken: string;
}

export interface ESPCDFUserInterface {
  identifier: string;
  userInfo: ESPCDFUserInfo;
  customData?: Record<string, any>;
  operations: ESPCDFUserOperation;
  _raw: any;
  setStoreCallbacks?(callbacks: GroupStoreCallbacks): void;
}

interface PermissionType {
  read?: string[];
  write?: string[];
}
/**
 * Represents the data entry for custom data.
 */
interface DataEntry<T = unknown> {
  value?: T;
  perms?: PermissionType[] | null;
}
/**
 * Represents the request payload for user custom data.
 */
export type ESPCDFUserCustomDataRequest = Record<string, DataEntry | null>;

export interface ESPCDFCreateGroupRequest {
  name: string;
  nodeIds?: string[];
  description?: string;
  customData?: Record<string, any>;
  type?: string;
  mutuallyExclusive?: boolean;
  metadata?: Record<string, any>;
}

export interface ESPCDFMatterPrecommissionInfo {
  groupId: string;
  fabricId: string;
  name: string;
  userNoc: string;
  matterUserId: string;
  rootCa: string;
  ipk?: string;
  groupCatIdOperate?: string;
  groupCatIdAdmin?: string;
  userCatId?: string;
}
