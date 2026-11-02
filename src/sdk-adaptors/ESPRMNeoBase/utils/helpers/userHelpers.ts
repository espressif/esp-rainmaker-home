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
  ESPCDF,
} from "@store";
import {
  ESPDevice,
  ESPRMNeoBase,
  ESPRMNeoNode,
  ESPRMNeoUser,
  ESPTransport,
  ESPRMNeoGroup,
  SubscriptionChannelIds,
} from "@espressif/rainmaker-neo-base-sdk";
import { STATUS_SUCCESS } from "@shared/utils/constants";
import { withTimeout } from "@shared/utils/asyncTimeout";
import { createCDFProvisioningDevice } from "../../transformers/transformToESPCDFProvisioningDevice";
import { transformToESPCDFNode } from "../../transformers/transformToESPCDFNode";
import { rearmMatterNodeInstance } from "@sdk-adaptors/ESPRMNeoBase/utils/matter/rearmMatterNodeInstance";
import {
  ESPRMNEO_USER_ATTR_CUSTOM_PHONE,
  ESPRMNEO_USER_ATTR_PHONE_NUMBER,
  ESPRMNEO_USER_DESC_PUSH_REGISTERED,
  ESPRMNEO_USER_DESC_PUSH_REGISTER_FAILED,
  ESPRMNEO_USER_DESC_PUSH_SKIPPED_NO_INTEGRATION,
  ESPRMNEO_USER_DESC_PUSH_SKIPPED_NO_TOKEN,
  ESPRMNEO_USER_DESC_PUSH_UNREGISTERED,
  ESPRMNEO_USER_ERR_PROVISION_ADAPTER_MISSING,
  ESPRMNEO_USER_LOG_CLOUD_WRITE_REGISTER_FAILED,
  ESPRMNEO_USER_LOG_MISSING_BACKEND_USER_ID,
  ESPRMNEO_USER_LOG_PUSH_NO_INTEGRATION,
  ESPRMNEO_USER_LOG_PUSH_REGISTER_FAILED,
  ESPRMNEO_USER_LOG_PUSH_UNREGISTER_FAILED,
  ESPRMNEO_USER_LOG_SUBSCRIBE_ALL_NODES_FAILED,
  formatRmneoNodeNotFoundInGroups,
} from "../constants";
import { Logger } from "../logger";
import { filterEspProvisionDevicesByRmneoCustomerId } from "./bleFilterHelpers";
import {
  isServedByAnotherChannel,
  projectRmneoUpdateToCdf,
} from "./cdfStoreSinkHelpers";
import {
  getRmneoGroupsShared,
  orderSdkGroupsForNodeLookup,
  sdkGroupContainsNodeId,
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
 * @param esprmneoUser - Authenticated RMNeo user instance.
 * @returns CDF user profile.
 */
export async function mapRmneoUserInfoToCdf(
  esprmneoUser: ESPRMNeoUser,
): Promise<ESPCDFUserInfo> {
  const userInfo = await esprmneoUser.getUserInfo();
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

  // Neo has no display-name API — omit name/nickname/username; only map present attributes.
  return {
    id: userId,
    name: "",
    email: email || "",
    ...(phone ? { phone } : {}),
  };
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
 * The SDK home group in the CDF store whose membership (home or rooms) lists `nodeId`.
 * @param nodeId - Node id to resolve.
 * @returns The SDK group behind the store's home entity, or undefined.
 */
function findSdkHomeGroupInStore(nodeId: string): ESPRMNeoGroup | undefined {
  const homes = ESPCDF.instance?.groupStore?.groupsList ?? [];
  for (const home of homes) {
    const raw = home._raw as unknown;
    if (!(raw instanceof ESPRMNeoGroup)) continue;
    // The Neo Matter SDK adds methods to the exported group type, so the
    // class check alone does not give that type; it is the same object.
    const group = raw as unknown as ESPRMNeoGroup;
    if (sdkGroupContainsNodeId(group, nodeId)) {
      return group;
    }
  }
  return undefined;
}

/**
 * Looks up a node across the user's SDK groups (ordered for cache locality) and
 * returns the CDF node transform.
 * @param esprmneoUser - Authenticated RMNeo user.
 * @param nodeId - Node id to resolve.
 * @returns CDF node for the first successful group lookup.
 */
export async function getRmneoCdfNodeById(
  esprmneoUser: ESPRMNeoUser,
  nodeId: string,
): Promise<ESPCDFNode> {
  // The home a node belongs to is already in the store; no need to download the
  // group list first. Fall back to the cloud list if membership has moved.
  const storeHome = findSdkHomeGroupInStore(nodeId);
  if (storeHome) {
    try {
      const rmngNode = await storeHome.getNode(nodeId, { cache: false });
      // A fresh instance again: restore the hybrid's Matter legs here too.
      await rearmMatterNodeInstance(rmngNode as never);
      return transformToESPCDFNode(rmngNode);
    } catch {
      /* membership may have changed since the last sync */
    }
  }

  const groups = await getRmneoGroupsShared(esprmneoUser);
  let lastError: unknown;
  for (const group of orderSdkGroupsForNodeLookup(groups, nodeId)) {
    try {
      const rmneoNode = await group.getNode(nodeId, { cache: false });
      // An uncached fetch mints a fresh instance, losing the Matter legs a
      // hybrid was given at commissioning; restore them before the transform.
      await rearmMatterNodeInstance(rmneoNode as never);
      return transformToESPCDFNode(rmneoNode);
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
 * @param esprmneoUser - Authenticated RMNeo user.
 * @param deviceToken - FCM/APNs device token (empty skips registration).
 * @returns CDF API data response with endpoint ids when registration succeeds.
 */
export async function registerRmneoPushEndpoint(
  esprmneoUser: ESPRMNeoUser,
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
    const integrations =
      (await esprmneoUser.listIntegrations()) as RmneoPushIntegration[];
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

    const endpointId = await esprmneoUser.registerIntegrationEndpoint(
      integrationId,
      token,
      resolveDeviceLocale(),
    );
    await savePushEndpoint(esprmneoUser, {
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
 * @param esprmneoUser - Authenticated RMNeo user.
 * @returns CDF success response whether or not an endpoint was stored.
 */
export async function unregisterRmneoPushEndpoint(
  esprmneoUser: ESPRMNeoUser,
): Promise<ESPCDFAPIResponse> {
  try {
    const stored = await readPushEndpoint(esprmneoUser);
    if (stored) {
      await esprmneoUser.unregisterIntegrationEndpoint(
        stored.integrationId,
        stored.endpointId,
      );
      await clearPushEndpoint(esprmneoUser);
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
 * No-op listener: the cloud channel is joined only so cloud writes reach the
 * node; live state comes from the channel serving it. The `/update/accepted`
 * bridge still passes cloud updates on whenever that channel is not live.
 */
const dropCloudUpdate = (): void => {};

/**
 * Keeps a node reachable for cloud writes when another channel serves it.
 *
 * Only the first channel that takes a node registers it with the cloud, and
 * Matter takes a RainMaker + Matter node it can reach on the home network.
 * After every full re-subscribe (MQTT reconnect, room or control group
 * change) such a node had no cloud registration, so cloud writes to it (a
 * rename, the time zone) failed with `Node … not registered`.
 * @param node - RMNeo SDK node that was just subscribed.
 */
async function keepCloudWritesRegistered(node: ESPRMNeoNode): Promise<void> {
  // A node the cloud channel serves was registered by the subscribe itself.
  if (!isServedByAnotherChannel(node)) {
    return;
  }
  const cloudChannel = ESPRMNeoBase.subscriptionManager
    .getAvailableChannelsForNode(node)
    .find((channel) => channel.channelId === SubscriptionChannelIds.MQTT);
  await cloudChannel?.subscribe(dropCloudUpdate, node);
}

/**
 * Longest one subscribe or unsubscribe may hold its user's queue (a full
 * subscribe takes a few seconds). Only a safety net for a call that never
 * finishes; when it fires the next step starts beside it, and a warning says so.
 */
const SUBSCRIPTION_STEP_TIMEOUT_MS = 60_000;

/** Last queued subscribe/unsubscribe per user (keyed by its registrations). */
const subscriptionQueueByState = new WeakMap<
  RmneoNodeSubscriptionState,
  Promise<void>
>();

/**
 * Runs one subscribe or unsubscribe after the ones queued before it for the
 * same user, so a home's subscribe never interleaves with a reconnect's
 * unsubscribe-all (which would leave that home's nodes unsubscribed).
 * @param subscriptionState - The user's node registrations.
 * @param step - The work to run.
 * @returns The step's outcome.
 */
function runInSubscriptionOrder(
  subscriptionState: RmneoNodeSubscriptionState,
  step: () => Promise<void>,
): Promise<void> {
  const previous = subscriptionQueueByState.get(subscriptionState);
  const result = previous ? previous.then(step) : step();
  const tooLong = new Error("Node subscription step took too long");
  // The time limit counts from when this step starts, not from when it queued.
  const stepStarted = previous ?? Promise.resolve();
  subscriptionQueueByState.set(
    subscriptionState,
    stepStarted
      .then(() => withTimeout(result, SUBSCRIPTION_STEP_TIMEOUT_MS, tooLong))
      .catch((error: unknown) => {
        if (error === tooLong) {
          Logger.warn(
            `Node subscription step still running after ${SUBSCRIPTION_STEP_TIMEOUT_MS / 1000} s; starting the next one beside it`,
          );
        }
      }),
  );
  return result;
}

/**
 * Subscribes the Neo subscription manager to all nodes in `params.nodeList`,
 * skipping nodes whose current SDK object is already registered. Runs in
 * order with this user's other subscribes and unsubscribes.
 *
 * Nodes restored from the CDF disk snapshot carry `_raw: null` until the
 * first live sync adopts the SDK node; they are skipped here (the sync
 * subscribes them) so a reconnect during that window cannot throw.
 * @param params - CDF subscribe request (node list + callback).
 * @param subscriptionState - Current node-id to SDK-node registrations.
 */
export function subscribeRmneoUserToNodeUpdates(
  params: ESPCDFSubscribeToNodeUpdatesRequestParams,
  subscriptionState: RmneoNodeSubscriptionState,
): Promise<void> {
  return runInSubscriptionOrder(subscriptionState, () =>
    subscribeNodesNow(params, subscriptionState),
  );
}

/**
 * Subscribes the nodes right away; see {@link subscribeRmneoUserToNodeUpdates}.
 * @param params - CDF subscribe request (node list + callback).
 * @param subscriptionState - Current node-id to SDK-node registrations.
 */
async function subscribeNodesNow(
  params: ESPCDFSubscribeToNodeUpdatesRequestParams,
  subscriptionState: RmneoNodeSubscriptionState,
): Promise<void> {
  const subscriptionManager = ESPRMNeoBase.subscriptionManager;
  const sdkNodes = params.nodeList
    .map((node) => node._raw as ESPRMNeoNode | null | undefined)
    .filter(
      (node): node is ESPRMNeoNode =>
        !!node?.nodeId && subscriptionState.get(node.nodeId) !== node,
    );

  if (sdkNodes.length === 0) {
    return;
  }

  try {
    await subscriptionManager.subscribeToAllNodes(sdkNodes, (update) =>
      projectRmneoUpdateToCdf(update, params.onNodeUpdate),
    );
    for (const node of sdkNodes) {
      subscriptionState.set(node.nodeId, node);
    }
  } catch (error) {
    Logger.warn(ESPRMNEO_USER_LOG_SUBSCRIBE_ALL_NODES_FAILED, error);
  }

  await Promise.all(
    sdkNodes.map(async (node) => {
      try {
        await keepCloudWritesRegistered(node);
      } catch (error) {
        Logger.warn(ESPRMNEO_USER_LOG_CLOUD_WRITE_REGISTER_FAILED, {
          nodeId: node.nodeId,
          error,
        });
      }
    }),
  );
}

/**
 * Unsubscribes every tracked node and clears the registration state. Runs in
 * order with this user's other subscribes and unsubscribes.
 * @param subscriptionState - Current node-id to SDK-node registrations.
 */
export function unsubscribeFromNodeUpdates(
  subscriptionState: RmneoNodeSubscriptionState,
): Promise<void> {
  return runInSubscriptionOrder(subscriptionState, () =>
    unsubscribeNodesNow(subscriptionState),
  );
}

/**
 * Unsubscribes every tracked node right away; see {@link unsubscribeFromNodeUpdates}.
 * @param subscriptionState - Current node-id to SDK-node registrations.
 */
async function unsubscribeNodesNow(
  subscriptionState: RmneoNodeSubscriptionState,
): Promise<void> {
  for (const nodeId of subscriptionState.keys()) {
    await ESPRMNeoBase.subscriptionManager
      .unsubscribeFromNode(nodeId)
      .catch(() => {});
  }
  subscriptionState.clear();
}
