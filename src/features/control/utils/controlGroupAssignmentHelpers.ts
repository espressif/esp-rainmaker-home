/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDeviceGroupSubGroups } from "@features/group/utils/roomsHelpers";
import {
  getPrimaryHomogeneousDeviceType,
  nodeMatchesHomogeneousType,
  resolveHomogeneousDeviceType,
  stripGroupControlSubgroupDisplayName,
} from "@features/group/utils/controlGroupHelpers";
import type { SettingsPickerOption } from "@features/control/utils/deviceAssignmentHelpers";
import type { ESPCDFGroup, ESPCDFNode } from "@store";

/**
 * Device-type control groups for a home.
 * @param home - Current home group
 * @returns Control group subgroups (`gc_` prefix)
 */
export function getControlGroupsForHome(
  home: ESPCDFGroup | null | undefined,
): ESPCDFGroup[] {
  const subGroups = (home?.subGroups as ESPCDFGroup[] | undefined) ?? [];
  return getDeviceGroupSubGroups(subGroups);
}

/**
 * Control groups whose `nodeIds` include the given node.
 * @param groups - Control groups on the current home
 * @param nodeId - RainMaker node id
 * @returns Groups that currently contain the node
 */
export function getControlGroupsContainingNode(
  groups: ESPCDFGroup[],
  nodeId: string | undefined,
): ESPCDFGroup[] {
  if (!nodeId) {
    return [];
  }
  return groups.filter((group) => group.nodeIds?.includes(nodeId) ?? false);
}

/**
 * Resolves the first control group id containing a node (stable display selection).
 * @param groups - Control groups for the current home
 * @param nodeId - RainMaker node id
 * @returns Group id when assigned, otherwise undefined
 */
export function getPrimaryControlGroupIdForNode(
  groups: ESPCDFGroup[],
  nodeId: string | undefined,
): string | undefined {
  return getControlGroupsContainingNode(groups, nodeId)[0]?.id;
}

/**
 * Control groups compatible with a node's homogeneous device type.
 * @param groups - All control groups on the home
 * @param node - Node being assigned
 * @param nodesById - Live node index for resolving group locked types
 * @returns Groups the node may join
 */
export function getCompatibleControlGroupsForNode(
  groups: ESPCDFGroup[],
  node: ESPCDFNode,
  nodesById: Record<string, ESPCDFNode> | undefined,
): ESPCDFGroup[] {
  const nodeType = getPrimaryHomogeneousDeviceType(node);
  if (!nodeType) {
    return [];
  }

  const nodeMap = new Map(Object.entries(nodesById ?? {}));

  return groups.filter((group) => {
    const lockedType = resolveHomogeneousDeviceType(group, nodeMap);
    if (!lockedType) {
      return true;
    }
    return nodeMatchesHomogeneousType(node, lockedType);
  });
}

/**
 * Maps compatible control groups to picker rows.
 * @param groups - Filtered control groups for the node
 * @returns Picker options sorted by display name
 */
export function getControlGroupPickerOptions(
  groups: ESPCDFGroup[],
): SettingsPickerOption[] {
  return groups
    .map((group) => ({
      id: group.id,
      label:
        stripGroupControlSubgroupDisplayName(group.name)?.trim() || group.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Moves a node into a control group: removes from other groups, then adds to target.
 * Sequential add/remove avoids MQTT resync races (same as room assignment).
 * @param groups - All compatible control groups on the home
 * @param nodeId - Node to assign
 * @param targetGroupId - Chosen control group id
 */
export async function moveNodeToControlGroup(
  groups: ESPCDFGroup[],
  nodeId: string,
  targetGroupId: string,
): Promise<void> {
  const currentGroups = getControlGroupsContainingNode(groups, nodeId);
  const alreadyInTarget = currentGroups.some(
    (group) => group.id === targetGroupId,
  );

  if (alreadyInTarget && currentGroups.length === 1) {
    return;
  }

  for (const group of currentGroups) {
    if (group.id !== targetGroupId) {
      await group.removeNodes([nodeId]);
    }
  }

  if (!alreadyInTarget) {
    const targetGroup = groups.find((group) => group.id === targetGroupId);
    if (!targetGroup) {
      throw new Error("Target control group not found");
    }
    await targetGroup.addNodes([nodeId]);
  }
}
