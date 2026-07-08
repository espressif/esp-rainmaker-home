/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGGroup } from "@espressif/rmng-base-sdk";

/** Node IDs listed on a home group or its room subgroups. */
export function readSdkGroupMemberNodeIds(group: ESPRMNGGroup): string[] {
  const ids = new Set<string>(group.nodeIds ?? []);
  for (const sub of group.subgroups ?? []) {
    for (const id of sub.nodeIds ?? []) {
      ids.add(id);
    }
  }
  return [...ids];
}

export function sdkGroupContainsNodeId(
  group: ESPRMNGGroup,
  nodeId: string,
): boolean {
  return readSdkGroupMemberNodeIds(group).includes(nodeId);
}

/**
 * Home group that owns `nodeId` per cloud `node_ids` / room membership.
 * Returns undefined when the node is not listed on any group yet.
 */
export function resolveSdkGroupIdForNodeId(
  groups: ESPRMNGGroup[],
  nodeId: string,
): string | undefined {
  for (const group of groups) {
    if (sdkGroupContainsNodeId(group, nodeId)) {
      return group.groupId;
    }
  }
  return undefined;
}

export function resolveSdkGroupForNodeId(
  groups: ESPRMNGGroup[],
  nodeId: string,
): ESPRMNGGroup | undefined {
  return groups.find((group) => sdkGroupContainsNodeId(group, nodeId));
}

/**
 * Restrict node config lookup to groups that actually list the node.
 * Avoids `/groups/<wrong>/nodes/<id>/config` 500s when the UI home ≠ cloud membership.
 */
export function orderSdkGroupsForNodeLookup(
  groups: ESPRMNGGroup[],
  nodeId: string,
  preferredGroupId?: string,
): ESPRMNGGroup[] {
  const members = groups.filter((group) =>
    sdkGroupContainsNodeId(group, nodeId),
  );
  const ordered =
    members.length > 0
      ? members
      : preferredGroupId
        ? groups.filter((g) => g.groupId === preferredGroupId)
        : groups;
  if (!preferredGroupId || ordered.length <= 1) {
    return ordered;
  }
  return [...ordered].sort((a, b) => {
    if (a.groupId === preferredGroupId) return -1;
    if (b.groupId === preferredGroupId) return 1;
    return 0;
  });
}
