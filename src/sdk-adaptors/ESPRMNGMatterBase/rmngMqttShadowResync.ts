/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNGBase,
  type ESPRMNGGroup,
  type ESPRMNGNode,
  type ESPRMNGUser,
} from "@espressif/rmng-base-sdk";
import type { ESPCDFNode, ESPCDFUser } from "@store";
import { ESPCDF } from "@store";
import { isRmngStackSdkId } from "@config/sdk.identifiers";
import {
  subscribeHybridNodeChannels,
  attachHybridSdkMqttSubscription,
  resetHybridSdkMqttAttachment,
} from "./transformers/rmngHybridSubscribeChannels";
import { bindHybridMatterMqttParamsBridge } from "./utils/bindHybridMatterMqttParamsBridge";
import {
  isRmngMatterHybridCdfNode,
  isRmngPureMatterCdfNode,
} from "./utils/rmngMatterNodeKind";
import { clearRmngMatterEndpointShadowDedupe } from "./bridge/utils/rmngMatterShadowDedupe";
import { getRmngHybridSubscribeUpdateHandler } from "./rmngHybridSubscribeSession";
import { kickMatterLocalDiscoveryAfterNodesInStore } from "@shared/utils/matterDiscoveryGroupCallbacks";
import { ensureRmngMatterInChannelOrder } from "./transformers/matterChannelOrder";
import {
  normalizeRmngMatterSdkNodeSubscribeShape,
} from "./utils/rmngMatterSubscribeShape";
import { resolveGroupNodeCapabilityFromStore } from "./utils/rmngGroupNodeDetailsContext";

const LOG = "[rmngMqttShadowResync]";

/** `getNode` supports optional `fromCloud` in runtime SDK; package types may lag. */
type GetNodeWithCloud = (
  nodeId: string,
  fromCloud?: boolean,
) => Promise<ESPRMNGNode>;

/**
 * Returns true when the logged-in CDF user wraps {@link ESPRMNGUser} (Rainmaker NG base SDK).
 */
export function isRmngBaseUser(
  user: ESPCDFUser | null | undefined,
): user is ESPCDFUser & { _raw: ESPRMNGUser } {
  return isRmngStackSdkId(user?.identifier) && user?._raw != null;
}

/** Resolves RMNG group id from `groupId` or legacy `group_id`. */
export function resolveRmngGroupId(
  group: ESPRMNGGroup | undefined,
): string | undefined {
  if (!group) return undefined;
  const id = group.groupId?.trim();
  if (id) return id;
  const legacy = (group as { group_id?: string }).group_id?.trim();
  return legacy || undefined;
}

/** SDK getNode uses `groupId`; API payloads may only populate `group_id`. */
function ensureSdkGroupHasGroupId(group: ESPRMNGGroup): ESPRMNGGroup {
  const id = resolveRmngGroupId(group);
  if (!id || group.groupId?.trim() === id) {
    return group;
  }
  group.groupId = id;
  return group;
}

function resolveParentHomeGroup(
  groups: ESPRMNGGroup[],
  parentHomeId: string | undefined,
  parentHomeGroup: ESPRMNGGroup | undefined,
): ESPRMNGGroup | undefined {
  const targetId =
    parentHomeId?.trim() ||
    resolveRmngGroupId(parentHomeGroup) ||
    undefined;
  if (!targetId) {
    return undefined;
  }

  const fromFreshGroups = groups.find(
    (g) => resolveRmngGroupId(g) === targetId,
  );
  if (fromFreshGroups) {
    return ensureSdkGroupHasGroupId(fromFreshGroups);
  }

  if (parentHomeGroup && resolveRmngGroupId(parentHomeGroup) === targetId) {
    return ensureSdkGroupHasGroupId(parentHomeGroup);
  }

  return undefined;
}

function readMatterNodeId(cdfNode: ESPCDFNode): string | undefined {
  const direct = (cdfNode as { matterNodeId?: string }).matterNodeId;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const meta = cdfNode.metadata as
    | { matter_node_id?: string; matterNodeId?: string }
    | undefined;
  return meta?.matter_node_id ?? meta?.matterNodeId;
}

function isPlainRmngCdfNode(cdfNode: ESPCDFNode): boolean {
  return (
    !isRmngMatterHybridCdfNode(cdfNode) && !isRmngPureMatterCdfNode(cdfNode)
  );
}

async function clearMqttSubscriptions(nodeIds: string[]): Promise<void> {
  const mgr = ESPRMNGBase.subscriptionManager;
  await Promise.allSettled(
    nodeIds.map((nodeId) => mgr.unsubscribeFromNode(nodeId)),
  );
}

async function resubscribeHybridMqtt(nodeIds: string[]): Promise<void> {
  const handler = getRmngHybridSubscribeUpdateHandler();
  if (!handler) {
    console.warn(`${LOG} hybrid resubscribe skipped: no active subscribe handler`);
    return;
  }

  const store = ESPCDF.instance;
  if (!store) {
    return;
  }

  for (const nodeId of nodeIds) {
    const cdfNode = store.nodeStore?.getNodeById?.(nodeId);
    if (!cdfNode || !isRmngMatterHybridCdfNode(cdfNode)) {
      continue;
    }
    try {
      await subscribeHybridNodeChannels(nodeId, cdfNode, handler);
    } catch (error) {
      console.warn(`${LOG} hybrid resubscribe failed for ${nodeId}`, error);
    }
  }
}

/** Re-attaches MQTT subscription for classic RMNG-only nodes after shadow name changes. */
async function resubscribePlainRmngMqtt(nodeIds: string[]): Promise<void> {
  const handler = getRmngHybridSubscribeUpdateHandler();
  if (!handler) {
    console.warn(`${LOG} RMNG resubscribe skipped: no active subscribe handler`);
    return;
  }

  const store = ESPCDF.instance;
  if (!store) {
    return;
  }

  const mgr = ESPRMNGBase.subscriptionManager;
  for (const nodeId of nodeIds) {
    const cdfNode = store.nodeStore?.getNodeById?.(nodeId);
    if (!cdfNode || !isPlainRmngCdfNode(cdfNode)) {
      continue;
    }
    const sdkNode = cdfNode._raw as ESPRMNGNode | undefined;
    if (!sdkNode) {
      continue;
    }
    try {
      await mgr.subscribeToNode(sdkNode, handler);
    } catch (error) {
      console.warn(`${LOG} RMNG resubscribe failed for ${nodeId}`, error);
    }
  }
}

async function refreshSdkNodesFromCloud(
  getNode: GetNodeWithCloud,
  nodeIds: string[],
): Promise<Map<string, ESPRMNGNode>> {
  const refreshed = new Map<string, ESPRMNGNode>();
  const results = await Promise.allSettled(
    nodeIds.map(async (nodeId) => {
      const sdkNode = await getNode(nodeId, true);
      return { nodeId, sdkNode };
    }),
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    refreshed.set(result.value.nodeId, result.value.sdkNode);
  }

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(
      `${LOG} ${failed}/${nodeIds.length} getNode(fromCloud) calls failed (node may not be in this home)`,
    );
  }

  return refreshed;
}

function syncCdfNodesWithRefreshedSdk(
  refreshedById: Map<string, ESPRMNGNode>,
): void {
  const store = ESPCDF.instance;
  if (!store?.nodeStore) return;

  for (const [nodeId, sdkNode] of refreshedById) {
    clearRmngMatterEndpointShadowDedupe(nodeId);

    const cdfNode = store.nodeStore.getNodeById(nodeId);
    if (!cdfNode) continue;

    cdfNode._raw = sdkNode;

    const capability = resolveGroupNodeCapabilityFromStore(nodeId);
    normalizeRmngMatterSdkNodeSubscribeShape(sdkNode, {
      matterNodeId: readMatterNodeId(cdfNode) ?? capability?.matterNodeId,
      groupNodeCapability: capability,
    });

    if (!isRmngMatterHybridCdfNode(cdfNode)) continue;

    bindHybridMatterMqttParamsBridge(cdfNode, sdkNode);
    resetHybridSdkMqttAttachment(sdkNode);
    void attachHybridSdkMqttSubscription(
      sdkNode,
      readMatterNodeId(cdfNode),
    ).catch((error) => {
      console.warn(`${LOG} hybrid SDK MQTT re-attach failed for ${nodeId}`, error);
    });
  }
}

/**
 * After subgroup (room) membership changes, refresh MQTT shadow registration for affected nodes.
 *
 * Hybrid nodes: dual-channel resubscribe. RMNG-only nodes: plain MQTT resubscribe via
 * {@link ESPRMNGBase.subscriptionManager} (same handler as post-login subscribe).
 */
export async function resyncMqttAfterSubgroupChange(options: {
  esprmngUser: ESPRMNGUser;
  /** CDF home id (`ESPCDFGroup.id`). Preferred when `_raw.groupId` is missing on fabric homes. */
  parentHomeId?: string;
  /** Parent home SDK group when available (not a subgroup row). */
  parentHomeGroup?: ESPRMNGGroup;
  /** Node IDs whose subgroup/shadow mapping may have changed. */
  nodeIdsToRefresh: string[];
}): Promise<void> {
  const { esprmngUser, parentHomeId, parentHomeGroup, nodeIdsToRefresh } =
    options;

  const ids = [...new Set(nodeIdsToRefresh)].filter(Boolean);
  if (ids.length === 0) {
    return;
  }

  await ensureRmngMatterInChannelOrder();
  await clearMqttSubscriptions(ids);

  let groups: ESPRMNGGroup[] = [];
  try {
    groups = await esprmngUser.getGroups();
  } catch (e) {
    console.warn(`${LOG} getGroups failed (continuing with getNode refresh)`, e);
  }

  const parentHome = resolveParentHomeGroup(
    groups,
    parentHomeId,
    parentHomeGroup,
  );
  if (!parentHome || !resolveRmngGroupId(parentHome)) {
    console.warn(`${LOG} parent home group unresolved`, {
      parentHomeId,
      rawGroupId: resolveRmngGroupId(parentHomeGroup),
    });
    return;
  }

  const getNode = parentHome.getNode.bind(parentHome) as GetNodeWithCloud;
  const refreshedById = await refreshSdkNodesFromCloud(getNode, ids);
  syncCdfNodesWithRefreshedSdk(refreshedById);
  await resubscribeHybridMqtt(ids);
  await resubscribePlainRmngMqtt(ids);
  kickMatterLocalDiscoveryAfterNodesInStore();
}
