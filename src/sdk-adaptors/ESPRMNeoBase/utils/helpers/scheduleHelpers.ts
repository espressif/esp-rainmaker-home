/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPRMNeoNode,
  ESPRMNeoSchedule,
  ScheduleActionMap,
  ScheduleItem,
  ScheduleTrigger,
} from "@espressif/rainmaker-neo-base-sdk";
import type {
  ESPCDFAPIResponse,
  ESPCDFScheduleAction,
  ESPCDFScheduleEditInput,
  ESPCDFScheduleValidity,
} from "@store";
import {
  HEADLESS_ERROR_UNKNOWN,
  SUCESS,
} from "@shared/utils/constants";
import {
  ESPRMNEO_SCHEDULE_ERR_GET_NODE_REQUIRED,
  formatRmneoScheduleNotFound,
} from "../constants";
import type {
  RmneoScheduleGetNode,
  ScheduleNodeResult,
} from "../types/scheduleTypes";

/** Fields used to build a Neo `ScheduleItem` (no CDF-only `info` / `flags`). */
export type RmneoScheduleItemInput = {
  id: string;
  name?: string;
  enabled?: boolean;
  triggers?: ScheduleTrigger[];
  action: ScheduleActionMap;
  validity?: ESPCDFScheduleValidity;
};

/**
 * Resolves `getNode` or throws when schedule mutations are attempted without it.
 * @param getNode - Optional node resolver from transform options
 * @param nodeId - Node id to resolve
 * @returns The ESPRMNeoNode for `nodeId`
 */
export async function requireScheduleNode(
  getNode: RmneoScheduleGetNode | undefined,
  nodeId: string,
): Promise<ESPRMNeoNode> {
  if (!getNode) {
    throw new Error(ESPRMNEO_SCHEDULE_ERR_GET_NODE_REQUIRED);
  }
  return getNode(nodeId);
}

/**
 * Loads the ESPRMNeoSchedule instance for `scheduleId` on the given node.
 * @param node - Node whose schedules to search
 * @param scheduleId - Schedule id to find
 * @returns Matching ESPRMNeoSchedule
 */
export async function resolveScheduleOnNode(
  node: ESPRMNeoNode,
  scheduleId: string,
): Promise<ESPRMNeoSchedule> {
  const schedules = await node.getSchedules();
  const found = schedules.find((s) => s.id === scheduleId);
  if (!found) {
    throw new Error(formatRmneoScheduleNotFound(scheduleId, node.nodeId));
  }
  return found;
}

/**
 * Runs a per-node mutation and collects `{ node_id, status }` results for
 * ScheduleStoreSynchronizer. Typed as `ESPCDFAPIResponse` to match CDF op
 * signatures (runtime value remains the per-node array).
 * @param nodeIds - Nodes to operate on
 * @param run - Mutation for a single node id
 * @returns Per-node status results as ESPCDFAPIResponse
 */
export async function runScheduleOpsForEachNode(
  nodeIds: string[],
  run: (nodeId: string) => Promise<void>,
): Promise<ESPCDFAPIResponse> {
  const results: ScheduleNodeResult[] = [];
  for (const nodeId of nodeIds) {
    try {
      await run(nodeId);
      results.push({ node_id: nodeId, status: SUCESS });
    } catch (err) {
      results.push({
        node_id: nodeId,
        status: err instanceof Error ? err.message : HEADLESS_ERROR_UNKNOWN,
      });
    }
  }
  return results as unknown as ESPCDFAPIResponse;
}

/**
 * Builds a Neo `ScheduleItem` from CDF fields. Omits `info` / `flags` — those
 * are CDF-local and are not on Neo ScheduleItem.
 * @param fields - Schedule id, name, enabled, triggers, per-node action, validity
 * @returns ScheduleItem suitable for `node.createSchedule`
 */
export function buildRmneoScheduleItem(
  fields: RmneoScheduleItemInput,
): ScheduleItem {
  return {
    id: fields.id,
    name: fields.name,
    enabled: fields.enabled ?? true,
    triggers: fields.triggers ?? [],
    action: fields.action,
    validity: fields.validity,
  };
}

/**
 * Counts devices across a CDF action map (`nodeId → deviceName → params`).
 * @param action - CDF schedule action keyed by node id
 * @returns Total number of device keys across all nodes
 */
export function computeScheduleDevicesCount(
  action: ESPCDFScheduleAction | undefined,
): number {
  return Object.values(action ?? {}).reduce((acc, deviceAction) => {
    return acc + Object.keys(deviceAction ?? {}).length;
  }, 0);
}

/**
 * Collects unique node ids from one or more CDF action maps (used on edit when
 * membership may change).
 * @param maps - Action maps whose keys are node ids
 * @returns Deduplicated node id list
 */
export function collectNodeIdsFromActionMaps(
  ...maps: (ESPCDFScheduleAction | undefined)[]
): string[] {
  return Array.from(new Set(maps.flatMap((m) => Object.keys(m ?? {}))));
}

/**
 * Returns whether `actionMap` has an own entry for `nodeId`.
 * @param actionMap - CDF action map keyed by node id
 * @param nodeId - Node id to test
 * @returns True when the map owns that node key
 */
export function actionMapHasNode(
  actionMap: ESPCDFScheduleAction,
  nodeId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(actionMap, nodeId);
}

/**
 * Applies an edit to one node's schedule: remove if dropped from the action map,
 * create if newly added, otherwise update in place.
 * @param node - Resolved RMNeo node
 * @param scheduleId - Schedule id shared across nodes
 * @param hadNode - Whether the previous action map included this node
 * @param hasNode - Whether the new action map includes this node
 * @param item - Fields for create / update (action already scoped to this node)
 */
export async function applyScheduleEditOnNode(
  node: ESPRMNeoNode,
  scheduleId: string,
  hadNode: boolean,
  hasNode: boolean,
  item: RmneoScheduleItemInput,
): Promise<void> {
  if (hadNode && !hasNode) {
    await node.removeSchedule(scheduleId);
    return;
  }

  if (!hadNode && hasNode) {
    await node.createSchedule(buildRmneoScheduleItem(item));
    return;
  }

  const sdkSchedule = await resolveScheduleOnNode(node, scheduleId);
  await sdkSchedule.update({
    name: item.name,
    enabled: item.enabled ?? true,
    triggers: item.triggers ?? [],
    action: item.action,
    validity: item.validity,
  });
}

/**
 * Merges edit input over the current CDF schedule fields for a single node write.
 * @param scheduleId - Schedule id
 * @param schedule - Current CDF schedule fields
 * @param data - Partial edit input from the store
 * @param nodeAction - Per-node device action map for this write
 * @returns Fields ready for {@link buildRmneoScheduleItem} / update
 */
export function mergeScheduleEditFields(
  scheduleId: string,
  schedule: {
    name?: string;
    enabled?: boolean;
    triggers?: ScheduleTrigger[];
    validity?: ESPCDFScheduleValidity;
  },
  data: ESPCDFScheduleEditInput,
  nodeAction: ScheduleActionMap,
): RmneoScheduleItemInput {
  return {
    id: scheduleId,
    name: data.name ?? schedule.name,
    enabled: data.enabled ?? schedule.enabled ?? true,
    triggers: data.triggers ?? schedule.triggers ?? [],
    action: nodeAction,
    validity: data.validity ?? schedule.validity,
  };
}
