/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Transforms RMNeo schedule data to unified ESPCDFSchedule with CRUD operations
 * backed by @espressif/rainmaker-neo-base-sdk: node.createSchedule / removeSchedule and
 * ESPRMNeoSchedule.update / enable / delete. Compatible with esp-rainmaker-home
 * schedule store and ScheduleStoreSynchronizer (operations return array of
 * { node_id, status }).
 *
 * Neo `ScheduleItem` has no `info` / `flags`; those stay on the CDF object only
 * and are not sent on create/update.
 */

import {
  ESPCDFAPIResponse,
  ESPCDFSchedule,
  ESPCDFScheduleEditInput,
  ESPCDFScheduleOperation,
} from "@store";
import {
  actionMapHasNode,
  applyScheduleEditOnNode,
  buildRmneoScheduleItem,
  collectNodeIdsFromActionMaps,
  computeScheduleDevicesCount,
  mergeScheduleEditFields,
  requireScheduleNode,
  resolveScheduleOnNode,
  runScheduleOpsForEachNode,
} from "../utils/helpers/scheduleHelpers";
import { formatRmneoFallbackScheduleId } from "../utils/constants";
import type { TransformToESPCDFScheduleOptions } from "../utils/types/scheduleTypes";

export type {
  TransformToESPCDFScheduleOptions,
  RmneoScheduleGetNode,
  ScheduleNodeResult,
} from "../utils/types/scheduleTypes";

/**
 * Maps partial CDF schedule fields into an ESPCDFSchedule with add / edit /
 * remove / enable / disable wired to the RMNeo SDK. Responses are arrays of
 * `{ node_id, status }` so ScheduleStoreSynchronizer works.
 * @param schedule - Partial CDF schedule fields to materialize
 * @param identifier - Adaptor identifier stamped on the ESPCDFSchedule
 * @param _groupId - Group id (unused; node resolution goes through getNode)
 * @param options - Optional getNode resolver for mutations
 * @returns ESPCDFSchedule with operations wired to the RMNeo SDK
 */
export function transformToESPCDFSchedule(
  schedule: Partial<ESPCDFSchedule>,
  identifier: string,
  _groupId: string,
  options?: TransformToESPCDFScheduleOptions,
): ESPCDFSchedule {
  const scheduleId = schedule.id ?? formatRmneoFallbackScheduleId();
  const scheduleNodes = schedule.nodes ?? [];
  const getNode = options?.getNode;

  const operations: ESPCDFScheduleOperation = {
    /**
     * Appends this schedule onto each node via node.createSchedule.
     * @returns Per-node status array for ScheduleStoreSynchronizer
     */
    async add(): Promise<ESPCDFAPIResponse> {
      return runScheduleOpsForEachNode(scheduleNodes, async (nodeId) => {
        const node = await requireScheduleNode(getNode, nodeId);
        await node.createSchedule(
          buildRmneoScheduleItem({
            id: scheduleId,
            name: schedule.name,
            enabled: true,
            triggers: schedule.triggers,
            action: schedule.action?.[nodeId] ?? {},
            validity: schedule.validity,
          }),
        );
      });
    },

    /**
     * Updates this schedule on each affected node via ESPRMNeoSchedule.update
     * (or createSchedule / removeSchedule when node membership changes).
     * @param data - Partial schedule fields from the store edit path
     * @returns Per-node status array for ScheduleStoreSynchronizer
     */
    async edit(data: ESPCDFScheduleEditInput): Promise<ESPCDFAPIResponse> {
      const oldActionMap = schedule.action ?? {};
      const newActionMap = data.action ?? oldActionMap;
      // Edit can touch nodes outside the original list (e.g. device moved nodes).
      const nodeIds = collectNodeIdsFromActionMaps(oldActionMap, newActionMap);

      return runScheduleOpsForEachNode(nodeIds, async (nodeId) => {
        const node = await requireScheduleNode(getNode, nodeId);
        await applyScheduleEditOnNode(
          node,
          scheduleId,
          actionMapHasNode(oldActionMap, nodeId),
          actionMapHasNode(newActionMap, nodeId),
          mergeScheduleEditFields(
            scheduleId,
            schedule,
            data,
            newActionMap[nodeId] ?? {},
          ),
        );
      });
    },

    /**
     * Deletes this schedule from each node via node.removeSchedule.
     * @returns Per-node status array for ScheduleStoreSynchronizer
     */
    async remove(): Promise<ESPCDFAPIResponse> {
      return runScheduleOpsForEachNode(scheduleNodes, async (nodeId) => {
        const node = await requireScheduleNode(getNode, nodeId);
        await node.removeSchedule(scheduleId);
      });
    },

    /**
     * Enables this schedule on each node via ESPRMNeoSchedule.enable(true).
     * @returns Per-node status array for ScheduleStoreSynchronizer
     */
    async enable(): Promise<ESPCDFAPIResponse> {
      return runScheduleOpsForEachNode(scheduleNodes, async (nodeId) => {
        const node = await requireScheduleNode(getNode, nodeId);
        const sdkSchedule = await resolveScheduleOnNode(node, scheduleId);
        await sdkSchedule.enable(true);
      });
    },

    /**
     * Disables this schedule on each node via ESPRMNeoSchedule.enable(false).
     * @returns Per-node status array for ScheduleStoreSynchronizer
     */
    async disable(): Promise<ESPCDFAPIResponse> {
      return runScheduleOpsForEachNode(scheduleNodes, async (nodeId) => {
        const node = await requireScheduleNode(getNode, nodeId);
        const sdkSchedule = await resolveScheduleOnNode(node, scheduleId);
        await sdkSchedule.enable(false);
      });
    },
  };

  const devicesCount =
    schedule.devicesCount ?? computeScheduleDevicesCount(schedule.action);

  return new ESPCDFSchedule({
    id: scheduleId,
    name: schedule.name ?? "",
    info: schedule.info ?? "",
    nodes: scheduleNodes,
    triggers: schedule.triggers ?? [],
    action: schedule.action ?? {},
    enabled: schedule.enabled,
    validity: schedule.validity,
    flags: schedule.flags,
    devicesCount,
    adaptorIdentifier: identifier,
    operations,
    _raw: schedule,
  });
}
