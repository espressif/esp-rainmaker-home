/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFDevice, ESPCDFDeviceParam, ESPCDFGroup, ESPCDFNode } from "@store";
import { GROUP_TYPE_ROOM } from "@shared/utils/constants";
import {
  buildGroupParamBroadcastSetParamsPayload,
  type GroupParamBroadcastOptions,
  type GroupParamBroadcastTargetRow,
} from "@shared/utils/groupParamBroadcastEnvelope";
import { getValidHomes } from "@store";

/**
 * Group-control subgroups are identified by this prefix on the subgroup storage name
 * (e.g. `gc_Living Room Lights`). UI strips the prefix for display.
 */
export const GROUP_CONTROL_SUBGROUP_PREFIX = "gc_";

/**
 * Checks whether group control subgroup name matches the expected condition.
 */
export function isGroupControlSubgroupName(name?: string): boolean {
  return Boolean(name?.startsWith(GROUP_CONTROL_SUBGROUP_PREFIX));
}

/**
 * Handles strip group control subgroup display name logic for this module.
 */
export function stripGroupControlSubgroupDisplayName(name?: string): string {
  if (!name) return "";
  return isGroupControlSubgroupName(name)
    ? name.slice(GROUP_CONTROL_SUBGROUP_PREFIX.length)
    : name;
}

/** Ensures exactly one `gc_` prefix for API storage name. */
export function toGroupControlStorageName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return GROUP_CONTROL_SUBGROUP_PREFIX;
  return isGroupControlSubgroupName(t) ? t : `${GROUP_CONTROL_SUBGROUP_PREFIX}${t}`;
}

/** Stored on device-type subgroups so edits stay consistent across sessions */
export const HOMOGENEOUS_DEVICE_TYPE_KEY = "homogeneousDeviceType";

/** Room tabs / room lists: normal room subgroups only (excludes `gc_` group-control names). */
export function isRoomSubgroup(group: Pick<ESPCDFGroup, "type" | "name">): boolean {
  if (isGroupControlSubgroupName(group.name)) return false;
  const t = group.type;
  return t === GROUP_TYPE_ROOM;
}

/** Group-control subgroup: identified by `gc_` prefix on storage name. */
export function isDeviceTypeSubgroup(group: Pick<ESPCDFGroup, "name">): boolean {
  return isGroupControlSubgroupName(group.name);
}

/**
 * When every device on the node that exposes params shares the same `device.type`,
 * returns that type. Mixed-type nodes are excluded from homogeneous groups.
 */
export function getPrimaryHomogeneousDeviceType(node: ESPCDFNode): string | null {
  const devices = node.devices ?? [];
  const withParams = devices.filter((d) => (d.params?.length ?? 0) > 0 && d.type);
  if (withParams.length === 0) return null;
  const firstType = withParams[0].type as string;
  const allSame = withParams.every((d) => d.type === firstType);
  return allSame ? firstType : null;
}

/**
 * Handles node matches homogeneous type logic for this module.
 */
export function nodeMatchesHomogeneousType(
  node: ESPCDFNode,
  lockedType: string
): boolean {
  return getPrimaryHomogeneousDeviceType(node) === lockedType;
}

/**
 * Retrieves locked type from selection for downstream consumers.
 */
export function getLockedTypeFromSelection(
  nodes: ESPCDFNode[],
  selectedIds: string[]
): string | null {
  if (selectedIds.length === 0) return null;
  const first = nodes.find((n) => n.id === selectedIds[0]);
  if (!first) return null;
  return getPrimaryHomogeneousDeviceType(first);
}

/**
 * Home that contains the node in `nodeIds`, preferring the user's current home when valid.
 */
export function resolveHomeIdContainingNode(
  nodeId: string,
  allGroups: ESPCDFGroup[],
  preferredHomeId: string | null
): string | undefined {
  const homes = getValidHomes(allGroups);
  if (preferredHomeId) {
    const preferred = homes.find((g) => g.id === preferredHomeId);
    if (preferred?.nodeIds?.includes(nodeId)) return preferredHomeId;
  }
  return homes.find((g) => g.nodeIds?.includes(nodeId))?.id;
}

/**
 * Handles find device of type logic for this module.
 */
export function findDeviceOfType(
  node: ESPCDFNode,
  deviceType: string
): ESPCDFDevice | undefined {
  return node.devices?.find((d) => d.type === deviceType);
}

/**
 * Handles find matching param logic for this module.
 */
export function findMatchingParam(
  device: ESPCDFDevice,
  ref: ESPCDFDeviceParam
): ESPCDFDeviceParam | undefined {
  return device.params?.find(
    (p) =>
      p.name === ref.name &&
      p.type === ref.type &&
      (p.uiType ?? "") === (ref.uiType ?? "")
  );
}

/**
 * Handles resolve homogeneous device type logic for this module.
 */
export function resolveHomogeneousDeviceType(
  group: ESPCDFGroup,
  nodesById: Map<string, ESPCDFNode>
): string | null {
  const fromCustom = group.customData?.[HOMOGENEOUS_DEVICE_TYPE_KEY];
  if (typeof fromCustom === "string" && fromCustom.length > 0) {
    return fromCustom;
  }
  const firstId = group.nodeIds?.[0];
  if (!firstId) return null;
  const node = nodesById.get(firstId);
  return node ? getPrimaryHomogeneousDeviceType(node) : null;
}

/**
 * Sends one logical param value for each target row: {@link ESPCDFGroup.setParams} when
 * `deviceGroup` is defined (adaptors map each row’s device + param to SDK wire format), otherwise
 * calls {@link ESPCDFDeviceParam.setValue} on each row’s `param`.
 * @param deviceGroup Optional group; when absent, updates each row’s param only
 * @param targets Member devices with the concrete param instance to set on each
 * @param value Param value to publish (same value applied to every row)
 * @param options Optional error callback for group `setParams` failures
 */
export function broadcastGroupParam(
  deviceGroup: ESPCDFGroup | undefined,
  targets: GroupParamBroadcastTargetRow[],
  value: unknown,
  options?: GroupParamBroadcastOptions
): void {
  if (!deviceGroup) {
    void Promise.allSettled(targets.map((row) => row.param.setValue(value)));
    return;
  }
  const payload = buildGroupParamBroadcastSetParamsPayload(value, targets);
  if (!payload) {
    return;
  }
  void deviceGroup.setParams(payload).catch((err: unknown) => {
    console.error("[broadcastGroupParam] group setParams failed:", err);
    options?.onSetParamsError?.(err);
  });
}

