/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGGroup, NodeCapabilityInfo } from "@espressif/rmng-base-sdk";
import { ESPCDF } from "@store";
import type { ESPCDFGroup } from "@store";
import {
  isRmngPureMatterCapability,
  isRmngHybridMatterCapability,
  resolveRmngNodeCapabilityContext,
  buildSyntheticPureMatterCapability,
  isMatterOperationalHexNodeId,
  type RmngNodeCapabilityContext,
} from "@espressif/rmng-matter-sdk";
import { isRmngMatterCapableGroup } from "./rmngMatterGroupDetection";

function readGroupNodeIds(group: Pick<ESPRMNGGroup, "nodeIds">): string[] {
  const raw = group as Pick<ESPRMNGGroup, "nodeIds"> & { node_ids?: string[] };
  return group.nodeIds ?? raw.node_ids ?? [];
}

/** Home id for a group row (rooms/subgroups use `parentId`). */
export function resolveHomeGroupId(
  group: Pick<ESPRMNGGroup, "groupId" | "parentId">,
): string {
  const parent = group.parentId?.trim();
  return parent && parent.length > 0 ? parent : group.groupId;
}

interface RawGroupNodeDetailsAux {
  nodeDetails?: Record<string, NodeCapabilityInfo>;
  nodeIds?: string[];
}

/**
 * Authoritative `node_details` for node-kind detection. Rooms omit per-node
 * capability rows; the home group always carries the full map.
 */
export function resolveAuthoritativeNodeDetails(
  group: ESPRMNGGroup,
  rawAuxByGroupId?: Map<string, RawGroupNodeDetailsAux>,
): Record<string, NodeCapabilityInfo> | undefined {
  const homeId = resolveHomeGroupId(group);
  const homeDetails = rawAuxByGroupId?.get(homeId)?.nodeDetails;
  if (homeDetails && Object.keys(homeDetails).length > 0) {
    return homeDetails;
  }
  if (group.nodeDetails && Object.keys(group.nodeDetails).length > 0) {
    return group.nodeDetails;
  }
  return rawAuxByGroupId?.get(group.groupId)?.nodeDetails;
}

/** Full home `node_ids` list (rooms only list members). */
export function resolveAuthoritativeNodeIds(
  group: ESPRMNGGroup,
  rawAuxByGroupId?: Map<string, RawGroupNodeDetailsAux>,
): string[] | undefined {
  const homeId = resolveHomeGroupId(group);
  const fromHome = rawAuxByGroupId?.get(homeId)?.nodeIds;
  if (fromHome?.length) {
    return fromHome;
  }
  const fromGroup = readGroupNodeIds(group);
  return fromGroup.length > 0 ? fromGroup : rawAuxByGroupId?.get(group.groupId)?.nodeIds;
}

function readNodeDetailCapabilityNames(
  info: NodeCapabilityInfo | undefined,
): string[] {
  const raw = (info as { capabilities?: unknown } | undefined)?.capabilities;
  if (Array.isArray(raw)) {
    return raw.filter((c): c is string => typeof c === "string");
  }
  if (raw && typeof raw === "object") {
    return Object.keys(raw as Record<string, unknown>);
  }
  return [];
}

/**
 * Corrects inflated `hasMatter` from older Matter SDK builds that equate
 * `capabilities: ["rmng"]` with Matter. Wire `node_details` names win.
 */
export function correctRmngOnlyNodeCapability(
  capability: RmngNodeCapabilityContext | undefined,
  nodeDetailsInfo: NodeCapabilityInfo | undefined,
): RmngNodeCapabilityContext | undefined {
  if (!capability) {
    return capability;
  }
  const names = readNodeDetailCapabilityNames(nodeDetailsInfo);
  const rmngOnly =
    names.includes("rmng") &&
    !names.includes("matter")
  if (!rmngOnly || capability.matterNodeId) {
    return capability;
  }
  if (!capability.hasMatter && !capability.isRainmakerMatter) {
    return capability;
  }
  return {
    ...capability,
    hasMatter: false,
    isRainmakerMatter: false,
  };
}

/** Reads per-node capability from GET /v1/groups `node_details`. */
export function resolveGroupNodeCapability(
  group: Pick<ESPRMNGGroup, "nodeDetails">,
  nodeId: string,
): RmngNodeCapabilityContext | undefined {
  const info = group.nodeDetails?.[nodeId];
  if (!info) {
    return undefined;
  }
  return resolveRmngNodeCapabilityContext(info);
}

export function isRmngMatterHybridGroupNode(
  capability: RmngNodeCapabilityContext | undefined,
  nodeId?: string,
): boolean {
  return !!capability && isRmngHybridMatterCapability(capability, nodeId);
}

export function isPureMatterGroupNode(
  capability: RmngNodeCapabilityContext | undefined,
  nodeId?: string,
): boolean {
  return !!capability && isRmngPureMatterCapability(capability, nodeId);
}

export function resolveGroupNodeCapabilityFromSubtree(
  group: ESPRMNGGroup,
  nodeId: string,
): RmngNodeCapabilityContext | undefined {
  const direct = resolveGroupNodeCapability(group, nodeId);
  if (direct) {
    return direct;
  }
  const parentId = group.parentId?.trim();
  if (parentId) {
    const fromStore = resolveGroupNodeCapabilityFromStore(nodeId, parentId);
    if (fromStore) {
      return fromStore;
    }
  }
  for (const sub of group.subgroups ?? []) {
    const nested = resolveGroupNodeCapabilityFromSubtree(sub, nodeId);
    if (nested) {
      return nested;
    }
  }
  if (
    isRmngMatterCapableGroup(group) &&
    readGroupNodeIds(group).includes(nodeId) &&
    isMatterOperationalHexNodeId(nodeId)
  ) {
    return buildSyntheticPureMatterCapability(nodeId);
  }
  return undefined;
}

function homeContainsNode(home: ESPCDFGroup, nodeId: string): boolean {
  if (home.nodeIds?.includes(nodeId)) {
    return true;
  }
  return (home.subGroups ?? []).some((room) => room.nodeIds?.includes(nodeId));
}

/**
 * Resolves `node_details` capability for a node from the CDF group store
 * (used when building a single node without a full `getNodes()` pass).
 */
export function resolveGroupNodeCapabilityFromStore(
  nodeId: string,
  groupId?: string,
): RmngNodeCapabilityContext | undefined {
  const groups = ESPCDF.instance?.groupStore?.groupsList ?? [];
  const home =
    (groupId ? groups.find((g) => g.id === groupId) : undefined) ??
    groups.find((g) => homeContainsNode(g, nodeId));
  const raw = home?._raw as ESPRMNGGroup | undefined;
  if (!raw) {
    return undefined;
  }
  return resolveGroupNodeCapabilityFromSubtree(raw, nodeId);
}

/** True when every listed node is RMNG-only per group `node_details`. */
export function isRmngOnlyGroupNodeDetails(
  nodeDetails: Record<string, NodeCapabilityInfo> | undefined,
  nodeIds: string[] | undefined,
): boolean {
  if (!nodeDetails || !nodeIds?.length) {
    return false;
  }
  return nodeIds.every((id) => {
    const names = readNodeDetailCapabilityNames(nodeDetails[id]);
    return names.length > 0 && names.every((c) => c === "rmng");
  });
}

export function hasUsableMatterTopology(
  localMeta?: Record<string, unknown> | null,
): boolean {
  const matterData = localMeta?.matter_data as
    | { endpoints?: Record<string, unknown> }
    | undefined;
  return (
    !!matterData?.endpoints &&
    typeof matterData.endpoints === "object" &&
    Object.keys(matterData.endpoints).length > 0
  );
}
