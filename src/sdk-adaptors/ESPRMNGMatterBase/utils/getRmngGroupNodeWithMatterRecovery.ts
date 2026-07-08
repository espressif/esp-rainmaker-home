/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNGGroup,
  ESPRMNGNode,
  type NodeCapabilityInfo,
  type NodeConfig,
} from "@espressif/rmng-base-sdk";
import {
  isNodeConfigUnavailableError,
  mergeCapabilityForConfigMissingRecovery,
  resolveRmngNodeCapabilityContext,
  buildSyntheticPureMatterCapability,
  isMatterOperationalHexNodeId,
  isRmngHybridMatterCapability,
  isRmngPureMatterCapability,
  type RmngNodeCapabilityContext,
} from "@espressif/rmng-matter-sdk";
import {
  resolveAuthoritativeNodeDetails,
  resolveGroupNodeCapabilityFromSubtree,
} from "./rmngGroupNodeDetailsContext";

const RECOVERY_LOG = "[rmngMatterGetNode]";

function readTopLevelMatterNodeIdFromDetail(
  info: NodeCapabilityInfo | undefined,
): string | undefined {
  if (!info || typeof info !== "object") {
    return undefined;
  }
  const raw = info as Record<string, unknown>;
  const id = raw.matter_node_id ?? raw.matterNodeId;
  if (typeof id !== "string") {
    return undefined;
  }
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function enrichCapabilityFromNodeDetail(
  ctx: RmngNodeCapabilityContext,
  info: NodeCapabilityInfo | undefined,
): RmngNodeCapabilityContext {
  const topLevelMatterNodeId = readTopLevelMatterNodeIdFromDetail(info);
  if (!topLevelMatterNodeId) {
    return ctx;
  }
  return {
    ...ctx,
    hasMatter: true,
    matterNodeId: topLevelMatterNodeId,
  };
}

/** Groups `node_details` capability for a node (includes top-level `matter_node_id`). */
export function resolveRmngNodeCapabilityForConfigRecovery(
  group: ESPRMNGGroup,
  nodeId: string,
  nodeDetails?: Record<string, NodeCapabilityInfo>,
): RmngNodeCapabilityContext {
  const details = nodeDetails ?? group.nodeDetails;
  const info = details?.[nodeId];
  const fromDetail = info
    ? enrichCapabilityFromNodeDetail(
        resolveRmngNodeCapabilityContext(info),
        info,
      )
    : undefined;
  const fromSubtree = resolveGroupNodeCapabilityFromSubtree(group, nodeId);
  const base = fromDetail ?? fromSubtree;
  if (!base) {
    if (isMatterOperationalHexNodeId(nodeId)) {
      return mergeCapabilityForConfigMissingRecovery(
        nodeId,
        buildSyntheticPureMatterCapability(nodeId),
      );
    }
    return {
      hasRmng: false,
      hasMatter: false,
      isRainmakerMatter: false,
    };
  }
  return mergeCapabilityForConfigMissingRecovery(nodeId, base);
}

function createMinimalRmngAdaptorNode(
  nodeId: string,
  groupId: string,
  subgroupId?: string,
): ESPRMNGNode {
  const config = {
    node_id: nodeId,
    devices: [],
    services: [],
    config: {},
  } as NodeConfig;

  return subgroupId
    ? new ESPRMNGNode(config, groupId, subgroupId)
    : new ESPRMNGNode(config, groupId);
}

/**
 * Loads a group node via SDK {@link ESPRMNGGroup.getNode}. On cloud `/config` 500
 * ("Node has no config"), recovers pure-Matter nodes using groups `node_details`
 * instead of failing — adaptor-only substitute for SDK getNode recovery.
 */
export async function getRmngGroupNodeWithMatterRecovery(
  group: ESPRMNGGroup,
  nodeId: string,
  fromCloud = false,
  options?: { nodeDetails?: Record<string, NodeCapabilityInfo> },
): Promise<ESPRMNGNode> {
  try {
    return await group.getNode(nodeId, fromCloud);
  } catch (error) {
    if (!isNodeConfigUnavailableError(error)) {
      throw error;
    }

    const authoritativeDetails =
      options?.nodeDetails ??
      resolveAuthoritativeNodeDetails(group);
    const capability = resolveRmngNodeCapabilityForConfigRecovery(
      group,
      nodeId,
      authoritativeDetails,
    );
    // Hybrid nodes need full cloud `/config` (RMNG devices + Matter endpoints).
    if (isRmngHybridMatterCapability(capability, nodeId)) {
      throw error;
    }
    if (!isRmngPureMatterCapability(capability, nodeId)) {
      throw error;
    }

    console.log(`${RECOVERY_LOG} recovered config-less pure-Matter node from groups node_details`, {
      groupId: group.groupId,
      nodeId,
      matterNodeId: capability.matterNodeId,
    });

    return createMinimalRmngAdaptorNode(
      nodeId,
      group.parentId?.trim() || group.groupId,
    );
  }
}
