/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFAPIDataResponse,
  ESPCDFAPIResponse,
  ESPCDFNode,
  ESPCDFProvisioningDevice,
  ESPCDFSubscribeToNodeUpdatesRequestParams,
  ESPCDFUserInfo,
} from "@store";
import {
  ESPDevice,
  ESPRMNeoBase,
  ESPRMNeoNode,
  ESPRMNeoUser,
  ESPTransport,
  type ESPNodeUpdateData,
} from "@espressif/rainmaker-neo-base-sdk";
import { STATUS_SUCCESS } from "@shared/utils/constants";
import { createCDFProvisioningDevice } from "../../transformers/transformToESPCDFProvisioningDevice";
import { transformToESPCDFNode } from "../../transformers/transformToESPCDFNode";
import {
  ESPRMNEO_NODE_UPDATE_SOURCE_MATTER,
  ESPRMNEO_NODE_UPDATE_TRANSPORT_MATTER,
  ESPRMNEO_NODE_UPDATE_TRANSPORT_MQTT,
  ESPRMNEO_USER_ATTR_CUSTOM_PHONE,
  ESPRMNEO_USER_ATTR_PHONE_NUMBER,
  ESPRMNEO_USER_DESC_PUSH_REGISTERED,
  ESPRMNEO_USER_DESC_PUSH_REGISTER_FAILED,
  ESPRMNEO_USER_DESC_PUSH_SKIPPED_NO_INTEGRATION,
  ESPRMNEO_USER_DESC_PUSH_SKIPPED_NO_TOKEN,
  ESPRMNEO_USER_DESC_PUSH_UNREGISTERED,
  ESPRMNEO_USER_ERR_PROVISION_ADAPTER_MISSING,
  ESPRMNEO_USER_LOG_MISSING_BACKEND_USER_ID,
  ESPRMNEO_USER_LOG_PUSH_NO_INTEGRATION,
  ESPRMNEO_USER_LOG_PUSH_REGISTER_FAILED,
  ESPRMNEO_USER_LOG_PUSH_UNREGISTER_FAILED,
  ESPRMNEO_USER_LOG_SUBSCRIBE_ALL_NODES_FAILED,
  formatRmneoNodeNotFoundInGroups,
} from "../constants";
import { Logger } from "../logger";
import { filterEspProvisionDevicesByRmneoCustomerId } from "./bleFilterHelpers";
import { projectRmneoUpdateToCdf } from "./cdfStoreSinkHelpers";
import { logRmneoDeviceParamsRaw, logRmneoNodeConfigRaw } from "./debugLogHelpers";
import {
  getRmneoGroupsShared,
  orderSdkGroupsForNodeLookup,
} from "./groupHelpers";
import {
  clearPushEndpoint,
  readPushEndpoint,
  resolveAppPushIdentity,
  resolveDeviceLocale,
  savePushEndpoint,
  selectPushIntegrationId,
  type RmneoPushIntegration,
} from "./pushIntegrationHelpers";

export type RmneoNodeSubscriptionState = Map<string, ESPRMNeoNode>;

/**
 * Maps Neo SDK `getUserInfo()` (Cognito + GET /v1/users) into CDF `ESPCDFUserInfo`.
 * @param esprmngUser - Authenticated RMNeo user instance.
 * @returns CDF user profile.
 */
export async function mapRmneoUserInfoToCdf(
  esprmngUser: ESPRMNeoUser,
): Promise<ESPCDFUserInfo> {
  const userInfo = await esprmngUser.getUserInfo();
  const email = userInfo.userAttributes.email || userInfo.username || "";
  // The backend's `user_id` (GET /v1/users) is the authoritative id. Deriving it
  // from the Cognito id token instead surfaced `cognito:username` / `sub` in the
  // UI, which does not match what the backend stores against the account.
  const userId = userInfo.userId ?? "";
  if (!userId) {
    Logger.warn(ESPRMNEO_USER_LOG_MISSING_BACKEND_USER_ID);
  }
  const phone =
    userInfo.userAttributes[ESPRMNEO_USER_ATTR_PHONE_NUMBER] ||
    userInfo.userAttributes[ESPRMNEO_USER_ATTR_CUSTOM_PHONE] ||
    undefined;

  return {
    id: userId,
    name: email,
    email: email || "",
    nickname: email || undefined,
    phone,
    username: email,
  } as ESPCDFUserInfo & { username?: string };
}

/**
 * BLE-scans via the Neo provision adapter and returns CDF provisioning devices
 * filtered to the given RainMaker customer id.
 * @param customerId - RainMaker customer id used to filter advertisements.
 * @returns CDF provisioning devices matching the customer.
 */
export async function searchRmneoBleDevicesByCustomerId(
  customerId: number,
): Promise<ESPCDFProvisioningDevice[]> {
  const adapter = ESPRMNeoBase.getProvisionAdapter();
  if (!adapter) {
    throw new Error(ESPRMNEO_USER_ERR_PROVISION_ADAPTER_MISSING);
  }
  const rawDevices = await adapter.searchESPDevices("", ESPTransport.ble);
  const filtered = filterEspProvisionDevicesByRmneoCustomerId(
    rawDevices ?? [],
    customerId,
  );
  return filtered.map((raw) => {
    const device = new ESPDevice(raw);
    Object.assign(device, {
      advertisementData: raw.advertisementData,
    });
    return createCDFProvisioningDevice(device);
  });
}

/**
 * Looks up a node across the user's SDK groups (ordered for cache locality) and
 * returns the CDF node transform.
 * @param esprmngUser - Authenticated RMNeo user.
 * @param nodeId - Node id to resolve.
 * @returns CDF node for the first successful group lookup.
 */
export async function getRmneoCdfNodeById(
  esprmngUser: ESPRMNeoUser,
  nodeId: string,
): Promise<ESPCDFNode> {
  const groups = await getRmneoGroupsShared(esprmngUser);
  let lastError: unknown;
  for (const group of orderSdkGroupsForNodeLookup(groups, nodeId)) {
    try {
      const rmngNode = await group.getNode(nodeId, { cache: false });
      logRmneoNodeConfigRaw("user.getNodeDetails", nodeId, rmngNode.config, {
        groupId: rmngNode.groupId ?? group.groupId,
        params: (rmngNode as { params?: unknown }).params,
      });
      return transformToESPCDFNode(rmngNode);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(formatRmneoNodeNotFoundInGroups(nodeId));
}

/**
 * Registers the device push token against the matching `/v1/integrations` row.
 *
 * Non-blocking: failures return a success-shaped response so login is never blocked.
 * @param esprmngUser - Authenticated RMNeo user.
 * @param deviceToken - FCM/APNs device token (empty skips registration).
 * @returns CDF API data response with endpoint ids when registration succeeds.
 */
export async function registerRmneoPushEndpoint(
  esprmngUser: ESPRMNeoUser,
  deviceToken: string,
): Promise<ESPCDFAPIDataResponse<unknown>> {
  const token = deviceToken?.trim();
  if (!token) {
    return {
      status: STATUS_SUCCESS,
      description: ESPRMNEO_USER_DESC_PUSH_SKIPPED_NO_TOKEN,
      data: null,
    };
  }

  try {
    const integrations = (await esprmngUser.listIntegrations()) as RmneoPushIntegration[];
    const identity = await resolveAppPushIdentity();
    const integrationId = selectPushIntegrationId(integrations, identity);

    if (!integrationId) {
      Logger.warn(ESPRMNEO_USER_LOG_PUSH_NO_INTEGRATION, {
        identity,
        available: integrations.map((i) => i.integration_id),
      });
      return {
        status: STATUS_SUCCESS,
        description: ESPRMNEO_USER_DESC_PUSH_SKIPPED_NO_INTEGRATION,
        data: null,
      };
    }

    const endpointId = await esprmngUser.registerIntegrationEndpoint(
      integrationId,
      token,
      resolveDeviceLocale(),
    );
    await savePushEndpoint(esprmngUser, {
      integrationId,
      endpointId,
    });

    return {
      status: STATUS_SUCCESS,
      description: ESPRMNEO_USER_DESC_PUSH_REGISTERED,
      data: { integrationId, endpointId },
    };
  } catch (error) {
    Logger.warn(ESPRMNEO_USER_LOG_PUSH_REGISTER_FAILED, error);
    return {
      status: STATUS_SUCCESS,
      description: ESPRMNEO_USER_DESC_PUSH_REGISTER_FAILED,
      data: null,
    };
  }
}

/**
 * Unregisters the persisted push delivery endpoint. Non-blocking so logout
 * is never held up by push teardown.
 * @param esprmngUser - Authenticated RMNeo user.
 * @returns CDF success response whether or not an endpoint was stored.
 */
export async function unregisterRmneoPushEndpoint(
  esprmngUser: ESPRMNeoUser,
): Promise<ESPCDFAPIResponse> {
  try {
    const stored = await readPushEndpoint(esprmngUser);
    if (stored) {
      await esprmngUser.unregisterIntegrationEndpoint(
        stored.integrationId,
        stored.endpointId,
      );
      await clearPushEndpoint(esprmngUser);
    }
  } catch (error) {
    Logger.warn(ESPRMNEO_USER_LOG_PUSH_UNREGISTER_FAILED, error);
  }
  return {
    status: STATUS_SUCCESS,
    description: ESPRMNEO_USER_DESC_PUSH_UNREGISTERED,
  };
}

/**
 * Logs the update, then projects it into CDF via {@link projectRmneoUpdateToCdf}.
 * @param update - Raw SDK node update.
 * @param onNodeUpdate - Optional CDF listener from subscribe params.
 */
function handleRmneoNodeUpdate(
  update: ESPNodeUpdateData,
  onNodeUpdate: ESPCDFSubscribeToNodeUpdatesRequestParams["onNodeUpdate"],
): void {
  const nodeId = update.nodeId;
  logRmneoDeviceParamsRaw(
    "subscribeToNodeUpdates.handleNodeUpdate",
    nodeId,
    update.source === ESPRMNEO_NODE_UPDATE_SOURCE_MATTER
      ? ESPRMNEO_NODE_UPDATE_TRANSPORT_MATTER
      : ESPRMNEO_NODE_UPDATE_TRANSPORT_MQTT,
    update.payload,
    {
      source: update.source,
      metadata: update.metadata,
    },
  );

  projectRmneoUpdateToCdf(update, onNodeUpdate);
}

/**
 * Subscribes the Neo subscription manager to all nodes in `params.nodeList`,
 * skipping nodes whose current SDK object is already registered.
 * @param params - CDF subscribe request (node list + callback).
 * @param subscriptionState - Current node-id to SDK-node registrations.
 */
export async function subscribeRmneoUserToNodeUpdates(
  params: ESPCDFSubscribeToNodeUpdatesRequestParams,
  subscriptionState: RmneoNodeSubscriptionState,
): Promise<void> {
  const subscriptionManager = ESPRMNeoBase.subscriptionManager;
  const sdkNodes = params.nodeList
    .map((node) => node._raw as ESPRMNeoNode)
    .filter((node) => subscriptionState.get(node.nodeId) !== node);

  if (sdkNodes.length === 0) {
    return;
  }

  try {
    await subscriptionManager.subscribeToAllNodes(sdkNodes, (update) =>
      handleRmneoNodeUpdate(update, params.onNodeUpdate),
    );
    for (const node of sdkNodes) {
      subscriptionState.set(node.nodeId, node);
    }
  } catch (error) {
    Logger.warn(ESPRMNEO_USER_LOG_SUBSCRIBE_ALL_NODES_FAILED, error);
  }
}

/**
 * Unsubscribes every tracked node and clears the registration state.
 * @param subscriptionState - Current node-id to SDK-node registrations.
 */
export async function unsubscribeFromNodeUpdates(
  subscriptionState: RmneoNodeSubscriptionState,
): Promise<void> {
  for (const nodeId of subscriptionState.keys()) {
    await ESPRMNeoBase.subscriptionManager
      .unsubscribeFromNode(nodeId)
      .catch(() => {});
  }
  subscriptionState.clear();
}
