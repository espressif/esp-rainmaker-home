/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNGGroup,
  ESPRMNGNode,
  type NodeCapabilityInfo,
} from "@espressif/rmng-base-sdk";
import { getRawNodeGroupsCached } from "./utils/rmngRawNodeGroupsCache";
import {
  ESPRMNGFabric,
  type ESPRMNGMatterCapabilityResponse,
} from "@espressif/rmng-matter-sdk";
import { ensureRmngMatterSdkConfigured } from "./ensureMatterSDK";
import {
  hasRmngMatterCapabilityData,
  isRmngMatterCapableGroup,
} from "./utils/rmngMatterGroupDetection";
import {
  resolveAuthoritativeNodeDetails,
  resolveAuthoritativeNodeIds,
  resolveGroupNodeCapability,
  resolveHomeGroupId,
  isRmngOnlyGroupNodeDetails,
} from "./utils/rmngGroupNodeDetailsContext";
import { resolveRmngSdkFabric, enrichRmngSdkGroupWithFabric } from "./utils/normalizeMatterFabricDetails";
import { logRmngNodeConfigRaw } from "@sdk-adaptors/ESPRMNGBase/utils/rmngAdaptorDebugLog";
import { isClassicRmngCloudNode } from "./utils/rmngMatterNodeKind";
import {
  normalizeClassicRmngSdkNode,
  normalizeRmngMatterSdkNodeSubscribeShape,
} from "./utils/rmngMatterSubscribeShape";
import { getRmngGroupNodeWithMatterRecovery } from "./utils/getRmngGroupNodeWithMatterRecovery";

async function appendNodesFromGetNodes(
  group: ESPRMNGGroup,
  seenNodeIds: Record<string, true>,
  out: ESPRMNGNode[],
  options?: {
    nodeIds?: string[];
    nodeDetails?: Record<string, NodeCapabilityInfo>;
  },
): Promise<void> {
  const nodeIds = options?.nodeIds ?? group.nodeIds ?? [];
  for (const nodeId of nodeIds) {
    try {
      const node = await getRmngGroupNodeWithMatterRecovery(group, nodeId, false, {
        nodeDetails: options?.nodeDetails,
      });
      logRmngNodeConfigRaw("group.getNodes", nodeId, node.config, {
        groupId: group.groupId,
        params: (node as { params?: unknown }).params,
      });
      if (nodeId && !seenNodeIds[nodeId]) {
        seenNodeIds[nodeId] = true;
        out.push(node);
      }
    } catch (error) {
      console.warn("[collectRmngGroupNodes] getNode failed", {
        groupId: group.groupId,
        nodeId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

interface MatterFabricSource {
  fabricDetails?: ESPRMNGMatterCapabilityResponse;
  nodeIds?: string[];
  nodeDetails?: Record<string, NodeCapabilityInfo>;
}

async function appendMatterFabricNodes(
  group: ESPRMNGGroup,
  source: MatterFabricSource,
  seenNodeIds: Record<string, true>,
  out: ESPRMNGNode[],
): Promise<void> {
  const homeGroupId = group.parentId?.trim() || group.groupId;
  const fabric = resolveRmngSdkFabric({
    groupId: homeGroupId,
    groupName: group.groupName,
    nodeIds: source.nodeIds,
    subgroups: group.subgroups,
    nodeDetails: source.nodeDetails,
    fabricDetails: source.fabricDetails,
  });

  if (typeof fabric.getNodesWithDetails !== "function") {
    await appendNodesFromGetNodes(group, seenNodeIds, out, {
      nodeIds: source.nodeIds,
      nodeDetails: source.nodeDetails,
    });
    return;
  }

  try {
    const nodes = await fabric.getNodesWithDetails();
    let plainById: Map<string, ESPRMNGNode> | undefined;
    const loadPlainNodes = async (): Promise<Map<string, ESPRMNGNode>> => {
      if (plainById) {
        return plainById;
      }
      plainById = new Map();
      try {
        for (const plain of await group.getNodes()) {
          const id =
            plain.nodeId ??
            (plain as { config?: { node_id?: string } }).config?.node_id ??
            "";
          if (id) {
            plainById.set(id, plain);
          }
        }
      } catch (plainError) {
        console.warn("[collectRmngGroupNodes] classic RMNG getNodes fallback failed", {
          groupId: group.groupId,
          reason:
            plainError instanceof Error ? plainError.message : String(plainError),
        });
      }
      return plainById;
    };

    for (const node of nodes) {
      const nodeId = node.nodeId ?? "";
      let resolved = node;
      if (isClassicRmngCloudNode(node)) {
        const plain = (await loadPlainNodes()).get(nodeId);
        if (plain) {
          resolved = plain;
        }
        normalizeClassicRmngSdkNode(resolved);
      } else {
        const capability = resolveGroupNodeCapability(
          { nodeDetails: source.nodeDetails },
          nodeId,
        );
        normalizeRmngMatterSdkNodeSubscribeShape(resolved, {
          matterNodeId: capability?.matterNodeId,
          groupNodeCapability: capability,
        });
      }
      logRmngNodeConfigRaw("group.getNodesWithDetails", nodeId, resolved.config, {
        groupId: group.groupId,
        params: (resolved as { params?: unknown }).params,
        usedPlainRmngNode: resolved !== node,
      });
      if (nodeId && !seenNodeIds[nodeId]) {
        seenNodeIds[nodeId] = true;
        out.push(resolved);
      }
    }
  } catch (error) {
    console.warn("[collectRmngGroupNodes] getNodesWithDetails failed", {
      groupId: group.groupId,
      reason: error instanceof Error ? error.message : String(error),
    });
    await appendNodesFromGetNodes(group, seenNodeIds, out);
  }
}

interface RawGroupAux {
  matter?: ESPRMNGMatterCapabilityResponse;
  nodeIds?: string[];
  nodeDetails?: Record<string, NodeCapabilityInfo>;
}

/**
 * Base `getGroups` returns ESPRMNGGroup objects that, in practice, arrive with empty
 * `nodeIds`/`nodeDetails` and DROP the API `matter` capability payload — so synced groups look
 * node-less and non-Matter to {@link isRmngMatterCapableGroup}. Re-read the raw stored group
 * list (saved by getGroups) to recover each group's `matter` (for fabric routing + `fabric_id`),
 * `node_ids`, and `node_details`, which {@link ESPRMNGFabric.getNodesWithDetails} needs to build
 * config-less (pure-Matter) nodes whose cloud GET /config returns 500.
 */
async function loadRawGroupAuxByGroupId(): Promise<Map<string, RawGroupAux>> {
  const map = new Map<string, RawGroupAux>();
  try {
    const raw = await getRawNodeGroupsCached();
    for (const g of raw?.groups ?? []) {
      map.set(g.group_id, {
        matter: (g as { matter?: ESPRMNGMatterCapabilityResponse }).matter,
        nodeIds: g.node_ids,
        nodeDetails: g.node_details,
      });
    }
  } catch (error) {
    console.warn(
      "[collectRmngGroupNodes] failed to load raw group aux",
      error,
    );
  }
  return map;
}

/**
 * Collects RMNG SDK nodes for a group subtree. Matter-capable groups use
 * {@link ESPRMNGFabric.getNodesWithDetails} (RainMaker parity) so pure-Matter
 * nodes survive missing `/config` (their cloud GET /config returns 500).
 */
export async function collectRmngNodesForGroup(
  group: ESPRMNGGroup,
): Promise<ESPRMNGNode[]> {
  await ensureRmngMatterSdkConfigured();

  const enrichedRoot = enrichRmngSdkGroupWithFabric(group);

  const rawAuxByGroupId = await loadRawGroupAuxByGroupId();
  const seenNodeIds: Record<string, true> = {};
  const out: ESPRMNGNode[] = [];

  async function walk(current: ESPRMNGGroup): Promise<void> {
    const aux = rawAuxByGroupId.get(current.groupId);
    const fabricDetails =
      (current instanceof ESPRMNGFabric ? current.fabricDetails : undefined) ??
      aux?.matter ??
      rawAuxByGroupId.get(resolveHomeGroupId(current))?.matter;
    const nodeDetails = resolveAuthoritativeNodeDetails(current, rawAuxByGroupId);
    const nodeIds = resolveAuthoritativeNodeIds(current, rawAuxByGroupId);

    const useMatterNodeCollection =
      (hasRmngMatterCapabilityData(fabricDetails) ||
        isRmngMatterCapableGroup(current)) &&
      !isRmngOnlyGroupNodeDetails(nodeDetails, nodeIds);

    if (useMatterNodeCollection) {
      await appendMatterFabricNodes(
        current,
        { fabricDetails, nodeIds, nodeDetails },
        seenNodeIds,
        out,
      );
    } else {
      await appendNodesFromGetNodes(current, seenNodeIds, out, {
        nodeIds,
        nodeDetails,
      });
    }

    // Room subgroups only carry membership; fabric nodes and node_details live on
    // the home group. Walking subgroups here runs getNodesWithDetails against the
    // room id (403/500 on /config) and can mis-classify hybrid nodes as pure Matter.
  }

  await walk(enrichedRoot);
  return out;
}

/**
 * Resolves a single node via the Matter collection path (no cloud GET /config).
 * Used when {@link ESPRMNGGroup.getNode} fails for pure-Matter nodes.
 */
export async function tryResolveRmngMatterNodeViaCollection(
  group: ESPRMNGGroup | ESPRMNGFabric,
  nodeId: string,
): Promise<ESPRMNGNode | undefined> {
  await ensureRmngMatterSdkConfigured();
  const enriched = enrichRmngSdkGroupWithFabric(group);

  const rawAuxByGroupId = await loadRawGroupAuxByGroupId();
  const nodeIds = resolveAuthoritativeNodeIds(enriched, rawAuxByGroupId);
  const nodeDetails = resolveAuthoritativeNodeDetails(enriched, rawAuxByGroupId);

  if (isRmngOnlyGroupNodeDetails(nodeDetails, nodeIds)) {
    return undefined;
  }
  if (!nodeIds?.includes(nodeId)) {
    return undefined;
  }
  const nodes = await collectRmngNodesForGroup(enriched);
  return nodes.find((node) => (node.nodeId ?? "") === nodeId);
}
