/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFGroup } from "./ESPCDFGroup";
import { ESPCDFGroupSharingRequest } from "./ESPCDFGroupSharingRequest";
import {
  ESPCDFUserInfo,
  ESPCDFPaginatedAPIResponse,
  ESPCDFUserOperationType,
  ESPCDFUserInterface,
  ESPCDFUserOperation,
  ESPCDFUserCustomDataRequest,
  ESPCDFCreateGroupRequest,
  ESPCDFAPIResponse,
  ESPCDFAPIDataResponse,
  GroupStoreCallbacks,
  ESPCDFCreateHomeRequestParams,
  AddDeviceParams,
  AddOnNetworkDeviceParams,
  ESPCDFSubscribeToNodeUpdatesRequestParams,
  ESPCDFMatterPrecommissionInfo,
  ESPCDFAssumeRoleRequest,
  ESPCDFAssumeRoleResponse,
} from "../types";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";
import { ESPCDFNode } from "./ESPCDFNode";

export class ESPCDFUser implements ESPCDFUserInterface {
  identifier: string;
  userInfo: ESPCDFUserInfo;
  customData?: Record<string, any>;
  operations: ESPCDFUserOperation;
  _raw: any;
  __storeCallbacks?: GroupStoreCallbacks;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFUser,
    ESPCDFUserOperationType
  >;

  constructor(userData: ESPCDFUserInterface) {
    this.identifier = userData.identifier;
    this.userInfo = userData.userInfo;
    this.customData = userData.customData;
    this.operations = userData.operations;
    this._raw = userData._raw;
    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFUser,
      ESPCDFUserOperationType
    >();
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<ESPCDFUser, ESPCDFUserOperationType>
  ): () => void {
    return this.events.subscribe(listener);
  }

  /**
   * Remove all listeners and clean up
   */
  dispose(): void {
    this.events.dispose();
  }

  /**
   * Internal method to emit callbacks after operations
   */
  private emit(
    operation: ESPCDFUserOperationType,
    success: boolean,
    data?: any,
    error?: any
  ): void {
    this.events.emit(this, operation, success, data, error);
  }

  /**
   * Wraps an operation with consistent event emission logic
   */
  private async runAndEmit<T>(
    operation: ESPCDFUserOperationType,
    execute: () => Promise<T>,
    getData?: (result: T) => unknown
  ): Promise<T> {
    let succeeded = false;
    let result!: T;
    let error: unknown;

    try {
      result = await execute();
      succeeded = true;
      return result;
    } catch (e) {
      error = e;
      throw e;
    } finally {
      this.emit(
        operation,
        succeeded,
        succeeded ? getData?.(result) : undefined,
        error
      );
    }
  }

  async getUserInfo(): Promise<ESPCDFUserInfo> {
    return this.runAndEmit(
      "getUserInfo",
      async () => {
        const response = await this.operations.getUserInfo();
        if (!response.data) {
          throw new Error("No data returned");
        }
        return response.data;
      },
      (data) => data
    );
  }

  async updateUserInfo(userInfo: Partial<ESPCDFUserInfo>): Promise<void> {
    return this.runAndEmit(
      "updateUserInfo",
      async () => {
        await this.operations.updateUserInfo(userInfo);
      },
      () => userInfo
    );
  }

  async getCustomData(): Promise<any> {
    return this.runAndEmit(
      "getCustomData",
      () => this.operations.getCustomData(),
      (data) => data
    );
  }

  async setCustomData(customData: ESPCDFUserCustomDataRequest): Promise<void> {
    return this.runAndEmit(
      "setCustomData",
      async () => {
        await this.operations.setCustomData(customData);
      },
      () => customData
    );
  }

  async changePassword(
    oldPassword: string,
    newPassword: string
  ): Promise<ESPCDFAPIResponse> {
    return this.operations.changePassword(oldPassword, newPassword);
  }

  async updateName(name: string): Promise<void> {
    return this.runAndEmit(
      "updateName",
      async () => {
        await this.operations.updateName(name);
      },
      () => ({ name })
    );
  }

  async requestAccountDeletion(): Promise<ESPCDFAPIResponse> {
    return this.operations.requestAccountDeletion();
  }

  async confirmAccountDeletion(code: string): Promise<void> {
    return this.runAndEmit("confirmAccountDeletion", async () => {
      await this.operations.confirmAccountDeletion(code);
    });
  }

  async logout(): Promise<void> {
    return this.runAndEmit("logout", async () => {
      await this.operations.logout();
    });
  }

  async registerForNotification(
    platform: string,
    deviceToken: string
  ): Promise<ESPCDFAPIDataResponse> {
    return this.operations.registerForNotification.call(this, platform, deviceToken)
  }

  async unregisterForNotification(deviceToken: string): Promise<ESPCDFAPIResponse> {
    return this.operations.unregisterForNotification(deviceToken);
  }

  async getIssuedGroupSharingRequests(
    count?: number
  ): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>> {
    return this.runAndEmit(
      "getIssuedGroupSharingRequests",
      () => this.operations.getIssuedGroupSharingRequests(count),
      (requests) => requests
    );
  }

  async getReceivedGroupSharingRequests(
    count?: number
  ): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>> {
    return this.runAndEmit(
      "getReceivedGroupSharingRequests",
      () => this.operations.getReceivedGroupSharingRequests(count),
      (requests) => requests
    );
  }
  async setTimeZone(timeZone: string): Promise<ESPCDFAPIResponse> {
    return this.operations.setTimeZone(timeZone);
  }
  async createGroup(
    groupRequest: ESPCDFCreateGroupRequest
  ): Promise<ESPCDFGroup> {
    return this.runAndEmit(
      "createGroup",
      () => this.operations.createGroup(groupRequest),
      (response) => response
    );
  }
  async searchESPDevices(
    devicePrefix: string,
    transport: string
  ): Promise<any[]> {
    return this.operations.searchESPDevices(devicePrefix, transport);
  }
  async searchESPBLEDevices(customerId: number): Promise<any[]> {
    return this.operations.searchESPBLEDevices(customerId);
  }
  async createProvisioningDevice(
    name: string,
    transport: string,
    security?: number,
    proofOfPossession?: string,
    softAPPassword?: string,
    username?: string
  ): Promise<any> {
    return this.operations.createProvisioningDevice(name, transport, security, proofOfPossession, softAPPassword, username);
  }
  async getGroupById(
    groupId: string,
    options: Record<string, any>
  ): Promise<any> {
    return this.operations.getGroupById(groupId, options);
  }
  async subscribeToEvent(
    event: string,
    callback: (data: any) => void
  ): Promise<any> {
    return this.operations.subscribeToEvent(event, callback);
  }
  async unsubscribeFromEvent(
    event: string,
    callback: (data: any) => void
  ): Promise<any> {
    return this.operations.unsubscribeFromEvent(event, callback);
  }

  async setMultipleNodesParams(
    payload: { nodeId: string; payload: any }[]
  ): Promise<any> {
    return this.operations.setMultipleNodesParams(payload);
  }

  /**
   * Fetches groups from all registered SDKs that support group fetching.
   * This method mirrors the functionality of groupStore.syncGroupsList() but is
   * accessible through the user entity and works through callback operations.
   * Calls operations.getGroups() (implemented with access to rootStore), updates groupStore
   * reactively through callbacks, and stores pagination context for on-demand loading.
   * @returns Promise resolving to batch operation result with successful and failed group fetches
   */
  async getGroups(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>> {
    return this.runAndEmit(
      "getGroups",
      () => this.operations.getGroups(),
      (result) => result
    );
  }
  async getNodeDetails(nodeId: string): Promise<ESPCDFNode> {
    return this.runAndEmit(
      "getNodeDetails",
      () => this.operations.getNodeDetails(nodeId),
      (node) => node
    );
  }
  /**
   * Get the access token for the user
   * @returns The access token
   */
  async getAccessToken(): Promise<string> {
    return this.operations.getAccessToken();
  }

  setStoreCallbacks(callbacks: GroupStoreCallbacks): void {
    this.__storeCallbacks = callbacks;
  }

  async syncHomeWithNodes(): Promise<ESPCDFGroup | null> {
    if (!this.__storeCallbacks || !this.operations.syncHomeWithNodes) {
      return null;
    }
    return this.operations.syncHomeWithNodes(this, this.__storeCallbacks);
  }

  async setCurrentHome(home: ESPCDFGroup): Promise<void> {
    if (!this.__storeCallbacks || !this.operations.setCurrentHome) {
      return;
    }
    await this.operations.setCurrentHome(this, this.__storeCallbacks, home);
  }

  /**
   * Create a home and add it to the group store via callbacks (same pattern as syncHomeWithNodes).
   * @param params - Name and node IDs to include in the home
   * @returns The created ESPCDFGroup
   */
  async createHome(params: ESPCDFCreateHomeRequestParams): Promise<ESPCDFGroup> {
    if (!this.__storeCallbacks || !this.operations.createHome) {
      throw new Error("Callbacks or operation not available");
    }
    return this.operations.createHome(params, this.__storeCallbacks);
  }

  /**
   * Add a device via provisioning. Orchestrates provision, timezone setup,
   * node fetch, and group store update in the adapter layer.
   * @returns The provisioned ESPCDFNode or null on failure
   */
  async addDevice(params: AddDeviceParams): Promise<ESPCDFNode | null> {
    if (!this.__storeCallbacks || !this.operations.addDevice) {
      return null;
    }
    return this.operations.addDevice(this, params, this.__storeCallbacks);
  }

  /**
   * Add a device that is already on the user's local network using the
   * challenge-response flow (LAN HTTP). The device is identified by mDNS
   * discovery and verified through a cloud-issued challenge that the device
   * signs with its credentials.
   * @param params - Discovered device, group id, and (optionally) POP
   * @returns Provisioned ESPCDFNode or `null` if the active adaptor does not
   *          support on-network provisioning or the verification did not yield
   *          a fetchable node.
   */
  async addOnNetworkDevice(
    params: AddOnNetworkDeviceParams
  ): Promise<ESPCDFNode | null> {
    if (!this.__storeCallbacks || !this.operations.addOnNetworkDevice) {
      return null;
    }
    return this.runAndEmit(
      "addOnNetworkDevice",
      () =>
        this.operations.addOnNetworkDevice!(
          this,
          params,
          this.__storeCallbacks!
        ),
      (node) => node
    );
  }

  async subscribeToNodeUpdates(params: ESPCDFSubscribeToNodeUpdatesRequestParams): Promise<void> {
    if (!this.operations.subscribeToNodeUpdates) {
      throw new Error("subscribeToNodeUpdates operation not available");
    }
    if (!params.onNodeUpdate) {
      params.onNodeUpdate = this.__storeCallbacks?.onNodeUpdate;
    }
    return this.operations.subscribeToNodeUpdates(params);
  }

  async unsubscribeFromNodeUpdates(): Promise<void> {
    if (!this.operations.unsubscribeFromNodeUpdates) {
      return;
    }
    return this.operations.unsubscribeFromNodeUpdates();
  }

  /**
   * Obtain short-lived AWS credentials scoped to the requested role/resources.
   * Throws if the active adaptor does not support this operation.
   */
  async assumeRole(request: ESPCDFAssumeRoleRequest): Promise<ESPCDFAssumeRoleResponse> {
    if (!this.operations.assumeRole) {
      throw new Error("assumeRole is not available on the current adaptor");
    }
    return this.operations.assumeRole(request);
  }

  // Matter commissioning operations (available when ESPRMMatterBase adaptor is active)

  async getGroupsAndFabrics(): Promise<ESPCDFGroup[]> {
    if (!this.operations.getGroupsAndFabrics) {
      throw new Error(
        "getGroupsAndFabrics not available on current adaptor"
      );
    }
    return this.runAndEmit(
      "getGroupsAndFabrics",
      () => this.operations.getGroupsAndFabrics!(),
      (result) => result
    );
  }

  async prepareFabricForMatterCommissioning(
    group: ESPCDFGroup
  ): Promise<ESPCDFGroup> {
    if (!this.operations.prepareFabricForMatterCommissioning) {
      throw new Error(
        "prepareFabricForMatterCommissioning not available on current adaptor"
      );
    }
    return this.runAndEmit(
      "prepareFabricForMatterCommissioning",
      () => this.operations.prepareFabricForMatterCommissioning!(group),
      (result) => result
    );
  }

  async isUserNocAvailableForFabric(fabricId: string): Promise<boolean> {
    if (!this.operations.isUserNocAvailableForFabric) {
      return false;
    }
    return this.operations.isUserNocAvailableForFabric(fabricId);
  }

  async storePrecommissionInfo(
    info: ESPCDFMatterPrecommissionInfo
  ): Promise<void> {
    if (!this.operations.storePrecommissionInfo) {
      throw new Error(
        "storePrecommissionInfo not available on current adaptor"
      );
    }
    return this.operations.storePrecommissionInfo(info);
  }
}
