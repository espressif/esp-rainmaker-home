/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFCreateGroupRequest,
  ESPCDFGroup,
  ESPCDFUser,
  ESPCDFUserInfo,
  ESPCDFUserCustomDataRequest,
  ESPCDFGroupSharingRequest,
  ESPCDFProvisioningDevice,
  ESPCDFAPIDataResponse,
  ESPCDFPaginatedAPIResponse,
  ESPCDFNode,
  ESPCDFUserOperation,
  ESPCDFAPIResponse,
  ESPCDFAssumeRoleRequest,
  ESPCDFAssumeRoleResponse,
  ESPCDFSubscribeToNodeUpdatesRequestParams,
  ESPCDFEventType,
} from "@store";
import {
  ESPRMNeoBase,
  ESPRMNeoUser,
  clearAllNcfgVersionMarkers,
} from "@espressif/rainmaker-neo-base-sdk";
import { ESPRMNeoBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { STATUS_SUCCESS } from "@shared/utils/constants";
import { transformToESPCDFGroup } from "./transformToESPCDFGroup";
import {
  createHome as rmngCreateHome,
  setCurrentHome as rmngSetCurrentHome,
  syncHomeWithNodes as rmngSyncHomeWithNodes,
} from "../groupSync";
import { transformToESPCDFGroupSharingRequest } from "./transformToESPCDFGroupSharingRequest";
import { createCDFProvisioningDevice } from "./transformToESPCDFProvisioningDevice";
import {
  logRmneoGroupsRaw,
} from "../utils/helpers/debugLogHelpers";
import { transformRmneoSdkGroupsToCdf } from "../utils/helpers/groupHelpers";
import { startRmneoLocalDiscoverySubscription } from "../utils/helpers/localDiscoveryHelpers";
import {
  clearRmneoMqttConnection,
  startRmneoMqttConnection,
} from "../utils/helpers/mqttConnectionHelpers";
import { clearAllCdfProjectedNcfg } from "../utils/helpers/nodeHelpers";
import { provisionDevice } from "../utils/helpers/provisionHelpers";
import { addOnNetworkDeviceProvision } from "../utils/helpers/onNetworkProvisionHelpers";
import {
  applyRmneoAdaptorUserCustomDataPatch,
  getRmneoAdaptorUserCustomData,
  resolveRmneoUserIdForCustomDataStorage,
} from "../utils/helpers/userCustomDataHelpers";
import {
  getRmneoCdfNodeById,
  mapRmneoUserInfoToCdf,
  registerRmneoPushEndpoint,
  type RmneoNodeSubscriptionState,
  searchRmneoBleDevicesByCustomerId,
  subscribeRmneoUserToNodeUpdates,
  unregisterRmneoPushEndpoint,
  unsubscribeFromNodeUpdates,
} from "../utils/helpers/userHelpers";
import { Logger } from "../utils/logger";
import {
  ESPRMNEO_USER_DESC_INFO_FETCHED,
  ESPRMNEO_USER_DESC_ISSUED_SHARING_FETCHED,
  ESPRMNEO_USER_DESC_PASSWORD_CHANGED,
  ESPRMNEO_USER_DESC_RECEIVED_SHARING_FETCHED,
  ESPRMNEO_USER_DESC_TIMEZONE_UPDATED,
  ESPRMNEO_USER_ERR_ASSUME_ROLE,
  ESPRMNEO_USER_ERR_CONFIRM_ACCOUNT_DELETION,
  ESPRMNEO_USER_ERR_CUSTOM_DATA_NO_USER_ID,
  ESPRMNEO_USER_ERR_GET_GROUP_BY_ID,
  ESPRMNEO_USER_ERR_REQUEST_ACCOUNT_DELETION,
  ESPRMNEO_USER_ERR_REQUIRED,
  ESPRMNEO_USER_ERR_SET_MULTIPLE_NODES_PARAMS,
  ESPRMNEO_USER_ERR_UPDATE_NAME,
  ESPRMNEO_USER_ERR_UPDATE_USER_INFO,
  ESPRMNEO_USER_LOG_CHANGE_PASSWORD_ERROR,
  ESPRMNEO_USER_LOG_CONFIRM_ACCOUNT_DELETION_UNSUPPORTED,
  ESPRMNEO_USER_LOG_CUSTOM_DATA_NO_USER_ID,
  ESPRMNEO_USER_LOG_INITIAL_USER_INFO_FAILED,
  ESPRMNEO_USER_LOG_REQUEST_ACCOUNT_DELETION_UNSUPPORTED,
  ESPRMNEO_USER_LOG_UPDATE_NAME_UNSUPPORTED,
  formatRmneoSubscribeToEventUnsupported,
} from "../utils/constants";

/**
 * Builds an `ESPCDFUser` that wraps an authenticated `ESPRMNeoUser`.
 *
 * Starts MQTT once for the session, hydrates `userInfo` asynchronously, and
 * exposes CDF operations that delegate to Neo SDK / adaptor helpers.
 * @param esprmngUser - Live RMNeo user, or `null` (throws).
 * @returns CDF user ready for store / UI consumption.
 */
export function transformToESPCDFUser(
  esprmngUser: ESPRMNeoUser | null,
): ESPCDFUser {
  if (!esprmngUser) {
    throw new Error(ESPRMNEO_USER_ERR_REQUIRED);
  }

  // Start MQTT once; Matter transform reuses the same promise via startRmneoMqttConnection.
  const mqttConnectionPromise = startRmneoMqttConnection(esprmngUser);

  const initialUserInfo: ESPCDFUserInfo = {
    id: "",
    name: "",
    email: "",
  };

  let discoveryCleanup: (() => void) | null = null;
  const nodeSubscriptionState: RmneoNodeSubscriptionState = new Map();

  const operations: ESPCDFUserOperation = {
    /**
     * Fetches Cognito + RainMaker profile and returns it as CDF user info.
     * @returns Success-wrapped CDF user profile.
     */
    async getUserInfo(): Promise<ESPCDFAPIDataResponse<ESPCDFUserInfo>> {
      const userInfo = await mapRmneoUserInfoToCdf(esprmngUser);
      return {
        status: STATUS_SUCCESS,
        description: ESPRMNEO_USER_DESC_INFO_FETCHED,
        data: userInfo,
      };
    },

    /**
     * RMNeo has no profile update API; always throws.
     * @param _userInfo - Unused partial profile.
     */
    async updateUserInfo(
      _userInfo: Partial<ESPCDFUserInfo>,
    ): Promise<ESPCDFAPIResponse<unknown>> {
      throw new Error(ESPRMNEO_USER_ERR_UPDATE_USER_INFO);
    },

    /**
     * Reads adaptor-persisted custom data for the resolved user id.
     * @returns Stored custom-data map, or `{}` when user id cannot be resolved.
     */
    async getCustomData(): Promise<Record<string, unknown>> {
      const userId =
        await resolveRmneoUserIdForCustomDataStorage(esprmngUser);
      if (!userId) {
        Logger.warn(ESPRMNEO_USER_LOG_CUSTOM_DATA_NO_USER_ID);
        return {};
      }
      return getRmneoAdaptorUserCustomData(userId);
    },

    /**
     * Merges a CDF custom-data patch into adaptor AsyncStorage for this user.
     * @param customData - Patch of custom-data entries to apply.
     */
    async setCustomData(
      customData: ESPCDFUserCustomDataRequest,
    ): Promise<void> {
      const userId =
        await resolveRmneoUserIdForCustomDataStorage(esprmngUser);
      if (!userId) {
        throw new Error(ESPRMNEO_USER_ERR_CUSTOM_DATA_NO_USER_ID);
      }
      await applyRmneoAdaptorUserCustomDataPatch(userId, customData);
    },

    /**
     * Changes the Cognito password via the Neo auth singleton.
     * @param oldPassword - Current password.
     * @param newPassword - Desired new password.
     * @returns Success response when the SDK call completes.
     */
    async changePassword(
      oldPassword: string,
      newPassword: string,
    ): Promise<ESPCDFAPIResponse<unknown>> {
      try {
        // Todo: Not working as expected — possible SDK issue; revisit later.
        const auth = ESPRMNeoBase.getAuthInstance();
        const response = await auth.changePassword(oldPassword, newPassword);
        return {
          status: STATUS_SUCCESS,
          description: response?.message || ESPRMNEO_USER_DESC_PASSWORD_CHANGED,
        };
      } catch (error) {
        Logger.error(ESPRMNEO_USER_LOG_CHANGE_PASSWORD_ERROR, error);
        throw error;
      }
    },

    /**
     * RMNeo has no display-name update API; always throws.
     * @param _name - Unused display name.
     */
    async updateName(_name: string): Promise<ESPCDFAPIResponse<unknown>> {
      Logger.warn(ESPRMNEO_USER_LOG_UPDATE_NAME_UNSUPPORTED);
      throw new Error(ESPRMNEO_USER_ERR_UPDATE_NAME);
    },

    /**
     * RMNeo has no account-deletion request API; always throws.
     */
    async requestAccountDeletion(): Promise<ESPCDFAPIResponse<unknown>> {
      Logger.warn(ESPRMNEO_USER_LOG_REQUEST_ACCOUNT_DELETION_UNSUPPORTED);
      throw new Error(ESPRMNEO_USER_ERR_REQUEST_ACCOUNT_DELETION);
    },

    /**
     * RMNeo has no account-deletion confirmation API; always throws.
     * @param _code - Unused confirmation code.
     */
    async confirmAccountDeletion(
      _code: string,
    ): Promise<ESPCDFAPIResponse<unknown>> {
      Logger.warn(ESPRMNEO_USER_LOG_CONFIRM_ACCOUNT_DELETION_UNSUPPORTED);
      throw new Error(ESPRMNEO_USER_ERR_CONFIRM_ACCOUNT_DELETION);
    },

    /**
     * Issued (outbound) sharing requests are not available on RMNeo; returns empty.
     * @returns Empty paginated sharing-request list.
     */
    async getIssuedGroupSharingRequests(): Promise<
      ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>
    > {
      return {
        status: STATUS_SUCCESS,
        description: ESPRMNEO_USER_DESC_ISSUED_SHARING_FETCHED,
        data: [],
        pagination: {
          hasNext: false,
          fetchNext: undefined,
        },
      };
    },

    /**
     * Lists inbound group sharing requests and maps them to CDF.
     * @returns Paginated CDF sharing requests (no server-side pagination yet).
     */
    async getReceivedGroupSharingRequests(): Promise<
      ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>
    > {
      const list = await esprmngUser.listSharingRequests();
      const data = list.map((req) =>
        transformToESPCDFGroupSharingRequest(req),
      );
      return {
        status: STATUS_SUCCESS,
        description: ESPRMNEO_USER_DESC_RECEIVED_SHARING_FETCHED,
        data,
        pagination: {
          hasNext: false,
          fetchNext: undefined,
        },
      };
    },

    /**
     * Tears down session subscriptions, logs out, and clears MQTT/version state.
     */
    async logout(): Promise<void> {
      const cleanupDiscovery = discoveryCleanup;
      discoveryCleanup = null;
      await Promise.allSettled([
        Promise.resolve().then(() => cleanupDiscovery?.()),
        unsubscribeFromNodeUpdates(nodeSubscriptionState),
      ]);

      try {
        await esprmngUser.logout();
      } finally {
        clearRmneoMqttConnection(esprmngUser);
        // Session reset: clear all cached ncfg_ver markers so the next
        // login does not inherit stale refresh baselines.
        await clearAllNcfgVersionMarkers().catch(() => {});
        clearAllCdfProjectedNcfg();
      }
    },

    /**
     * Persists timezone under custom data (`timeZone.value`).
     * @param timezone - IANA timezone string.
     * @returns Success response after custom-data write.
     */
    async setTimeZone(timezone: string): Promise<ESPCDFAPIResponse> {
      await operations.setCustomData({ timeZone: { value: timezone } });
      return {
        status: STATUS_SUCCESS,
        description: ESPRMNEO_USER_DESC_TIMEZONE_UPDATED,
      };
    },

    /**
     * Creates a top-level Neo group and returns its CDF transform.
     * @param data - CDF create-group request (uses `name`).
     * @returns CDF group for the new SDK group.
     */
    async createGroup(data: ESPCDFCreateGroupRequest): Promise<ESPCDFGroup> {
      const group = await esprmngUser.createGroup(data.name);
      return transformToESPCDFGroup(
        group,
        esprmngUser,
        ESPRMNeoBaseAdaptorIdentifier,
      );
    },

    /**
     * BLE-scans and filters provisionable devices by RainMaker customer id.
     * @param customerId - RainMaker customer id from advertisements.
     * @returns Matching CDF provisioning devices.
     */
    async searchESPBLEDevices(
      customerId: number,
    ): Promise<ESPCDFProvisioningDevice[]> {
      return searchRmneoBleDevicesByCustomerId(customerId);
    },

    /**
     * Searches ESP devices via the Neo user helper (prefix + transport).
     * @param devicePrefix - Name / prefix filter.
     * @param transport - Transport string forwarded to the SDK.
     * @returns CDF provisioning devices.
     */
    async searchESPDevices(
      devicePrefix: string,
      transport: string,
    ): Promise<ESPCDFProvisioningDevice[]> {
      const devices = await esprmngUser.searchESPDevices(
        devicePrefix,
        // SDK transport enum is wider than CDF's string; cast at the boundary.
        transport as Parameters<ESPRMNeoUser["searchESPDevices"]>[1],
      );
      return devices.map((d) => createCDFProvisioningDevice(d));
    },

    /**
     * Creates an ESP provision device descriptor and wraps it as CDF.
     * @param name - Device name.
     * @param transport - Transport string forwarded to the SDK.
     * @param security - Optional security scheme.
     * @param proofOfPossession - Optional PoP.
     * @param softAPPassword - Optional SoftAP password.
     * @param username - Optional SoftAP username.
     * @returns CDF provisioning device.
     */
    async createProvisioningDevice(
      name: string,
      transport: string,
      security?: number,
      proofOfPossession?: string,
      softAPPassword?: string,
      username?: string,
    ): Promise<ESPCDFProvisioningDevice> {
      const descriptor = await esprmngUser.createESPDevice(
        name,
        // SDK transport enum is wider than CDF's string; cast at the boundary.
        transport as Parameters<ESPRMNeoUser["createESPDevice"]>[1],
        security,
        proofOfPossession,
        softAPPassword,
        username,
      );
      return createCDFProvisioningDevice(descriptor);
    },

    /**
     * RMNeo has no standalone getGroupById; always throws.
     * @param _groupId - Unused group id.
     * @param _options - Unused options.
     */
    async getGroupById(
      _groupId: string,
      _options: Record<string, unknown>,
    ): Promise<unknown> {
      throw new Error(ESPRMNEO_USER_ERR_GET_GROUP_BY_ID);
    },

    /**
     * Subscribes to CDF user-level events (currently local discovery only).
     * @param event - CDF event type string.
     * @param callback - Listener invoked with discovery payloads.
     * @param _config - Unused config bag.
     */
    async subscribeToEvent(
      event: string,
      callback: (event: unknown) => void,
      _config?: Record<string, unknown>,
    ): Promise<void> {
      if (event === ESPCDFEventType.localDiscovery) {
        discoveryCleanup?.();
        discoveryCleanup = null;
        discoveryCleanup = await startRmneoLocalDiscoverySubscription(
          callback,
          esprmngUser,
        );
        return;
      }
      throw new Error(formatRmneoSubscribeToEventUnsupported(event));
    },

    /**
     * Tears down a prior `subscribeToEvent` (local discovery cleanup).
     * @param event - CDF event type string.
     * @param _callback - Unused; cleanup is by event type.
     */
    async unsubscribeFromEvent(
      event: string,
      _callback: (event: unknown) => void,
    ): Promise<void> {
      if (event === ESPCDFEventType.localDiscovery) {
        discoveryCleanup?.();
        discoveryCleanup = null;
      }
    },

    /**
     * Batch multi-node param set is unsupported on RMNeo; always throws.
     * @param _payload - Unused batch payload.
     */
    async setMultipleNodesParams(
      _payload: { nodeId: string; payload: any }[],
    ): Promise<ESPCDFAPIResponse<any>> {
      throw new Error(ESPRMNEO_USER_ERR_SET_MULTIPLE_NODES_PARAMS);
    },

    /**
     * Lists Neo groups, maps them to CDF, and returns a single page.
     * @returns Paginated CDF groups (no server-side pagination yet).
     */
    async getGroups(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>> {
      const groups = await esprmngUser.getGroups();
      logRmneoGroupsRaw("getGroups", { sdkGroups: groups });
      const cdfGroups = transformRmneoSdkGroupsToCdf(esprmngUser, groups);
      return {
        data: cdfGroups,
        pagination: {
          hasNext: false,
          fetchNext: undefined,
        },
      } as ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>;
    },

    /**
     * Resolves a node by id across the user's groups and returns CDF.
     * @param nodeId - Node id to look up.
     * @returns CDF node for the first successful group hit.
     */
    async getNodeDetails(nodeId: string): Promise<ESPCDFNode> {
      return getRmneoCdfNodeById(esprmngUser, nodeId);
    },

    /**
     * Returns the live Cognito access token from the Neo user.
     * Read from SDK storage, so it reflects the latest session refresh.
     * @returns Access token string.
     */
    async getAccessToken(): Promise<string> {
      return esprmngUser.getAccessToken();
    },

    /**
     * Syncs the current home's nodes into the CDF store (groupSync helper).
     * @param user - CDF user owning the home.
     * @param callbacks - Store mutation callbacks.
     * @returns Result of `syncHomeWithNodes`.
     */
    async syncHomeWithNodes(user, callbacks) {
      return rmngSyncHomeWithNodes(
        user as ESPCDFUser,
        callbacks,
        esprmngUser,
        mqttConnectionPromise,
      );
    },

    /**
     * Sets the active home in the CDF store (groupSync helper).
     * @param user - CDF user.
     * @param callbacks - Store mutation callbacks.
     * @param home - Home group to activate.
     * @returns Result of `setCurrentHome`.
     */
    async setCurrentHome(user, callbacks, home) {
      return rmngSetCurrentHome(user as ESPCDFUser, callbacks, home);
    },

    /**
     * Creates a home (top-level group), maps to CDF, and registers it via callbacks.
     * @param params - Create-home params for Neo.
     * @param callbacks - Store callbacks (`addGroup`).
     * @returns CDF home group.
     */
    async createHome(params, callbacks) {
      const newHome = await rmngCreateHome(esprmngUser, params);
      const cdfHome = transformToESPCDFGroup(
        newHome,
        esprmngUser,
        ESPRMNeoBaseAdaptorIdentifier,
      );
      callbacks.addGroup(cdfHome);
      return cdfHome;
    },

    /**
     * Runs the Neo provision flow for adding a device to a home.
     * @param user - CDF user.
     * @param params - Provision params.
     * @param callbacks - Store callbacks.
     * @returns Result of `provisionDevice`.
     */
    async addDevice(user, params, callbacks) {
      return provisionDevice(user as ESPCDFUser, params, callbacks);
    },

    /**
     * Runs on-network (LAN HTTP) challenge-response association for a device
     * discovered on the shared `_esp_rmaker_ctrl._tcp` instance.
     * @param user - CDF user.
     * @param params - Discovered device, group id, and optional POP.
     * @param callbacks - Store callbacks.
     * @returns The provisioned node, or `null` if it never reached the cloud.
     */
    async addOnNetworkDevice(user, params, callbacks) {
      return addOnNetworkDeviceProvision(user as ESPCDFUser, params, callbacks);
    },

    /**
     * Registers the device push token against the matching Neo integration.
     * @param _platform - Unused platform hint (identity comes from Expo config).
     * @param deviceToken - FCM/APNs token.
     * @returns Success-shaped response (non-blocking on failure).
     */
    async registerForNotification(
      _platform: string,
      deviceToken: string,
    ): Promise<ESPCDFAPIDataResponse<unknown>> {
      return registerRmneoPushEndpoint(esprmngUser, deviceToken);
    },

    /**
     * Unregisters the persisted push endpoint for this user (non-blocking).
     * @param _deviceToken - Unused; endpoint id comes from AsyncStorage.
     * @returns Success response after best-effort teardown.
     */
    async unregisterForNotification(
      _deviceToken: string,
    ): Promise<ESPCDFAPIResponse> {
      return unregisterRmneoPushEndpoint(esprmngUser);
    },

    /**
     * Assume-role for arbitrary node/group scopes is not supported; always throws.
     * @param _request - Unused assume-role request.
     */
    async assumeRole(
      _request: ESPCDFAssumeRoleRequest,
    ): Promise<ESPCDFAssumeRoleResponse> {
      throw new Error(ESPRMNEO_USER_ERR_ASSUME_ROLE);
    },

    /**
     * Subscribes the Neo subscription manager to node updates for `params.nodeList`.
     * @param params - Node list plus CDF `onNodeUpdate` callback.
     */
    async subscribeToNodeUpdates(
      params: ESPCDFSubscribeToNodeUpdatesRequestParams,
    ): Promise<void> {
      await subscribeRmneoUserToNodeUpdates(params, nodeSubscriptionState);
    },

    /**
     * Unsubscribes all node ids accumulated during this user session.
     */
    async unsubscribeFromNodeUpdates(): Promise<void> {
      await unsubscribeFromNodeUpdates(nodeSubscriptionState);
    },
  };

  const cdfUser = new ESPCDFUser({
    userInfo: initialUserInfo,
    operations: operations,
    _raw: esprmngUser,
    identifier: ESPRMNeoBaseAdaptorIdentifier,
  });

  // Hydrate CDF userInfo early from GET /v1/users.
  mapRmneoUserInfoToCdf(esprmngUser)
    .then((userInfo) => {
      cdfUser.userInfo = userInfo;
    })
    .catch((error) => {
      Logger.warn(ESPRMNEO_USER_LOG_INITIAL_USER_INFO_FAILED, error);
    });

  return cdfUser;
}
