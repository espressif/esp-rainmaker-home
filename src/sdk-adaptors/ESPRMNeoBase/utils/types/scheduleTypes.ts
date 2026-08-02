/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNeoNode } from "@espressif/rainmaker-neo-base-sdk";

/** Resolves an RMNeo node by id for per-node schedule mutations. */
export type RmneoScheduleGetNode = (nodeId: string) => Promise<ESPRMNeoNode>;

/**
 * Per-node result shape expected by ScheduleStoreSynchronizer
 * (`node_id` + `status` for each touched node).
 */
export type ScheduleNodeResult = {
  node_id: string;
  status: string;
};

/**
 * Options for {@link transformToESPCDFSchedule}. `getNode` resolves an
 * ESPRMNeoNode by id so create / update / remove / enable can call the SDK.
 * All CRUD operations require this callback.
 */
export interface TransformToESPCDFScheduleOptions {
  getNode?: RmneoScheduleGetNode;
}
