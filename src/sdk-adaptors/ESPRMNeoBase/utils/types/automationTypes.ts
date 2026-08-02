/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNeoNode } from "@espressif/rainmaker-neo-base-sdk";

/** Resolves an RMNeo node by id for automation trigger sync. */
export type RmneoAutomationGetNode = (nodeId: string) => Promise<ESPRMNeoNode>;

/** Resolved event objects for UI (deviceName, param, check, value). Used when trigger details are resolved in getAutomations. */
export type ResolvedAutomationEvents = {
  deviceName?: string;
  param?: string;
  check?: string;
  value?: unknown;
}[];

/** CDF-shaped action used when SDK action targets need pre-resolution (e.g. Matter hex paths). */
export type ResolvedAutomationAction = {
  nodeId: string;
  deviceName: string;
  param: string;
  value: unknown;
};

/** Options for {@link transformToESPCDFAutomation}. `getNode` is required to sync node triggers on event updates. */
export interface TransformToESPCDFAutomationOptions {
  resolvedEvents?: ResolvedAutomationEvents;
  /** When set, used instead of parsing SDK action targets (e.g. Matter hex paths). */
  resolvedActions?: ResolvedAutomationAction[];
  /** Used by operations.update to resolve node and sync triggers when events change. */
  getNode?: RmneoAutomationGetNode;
  /** Optional nodeId when known (e.g. from createAutomation); otherwise derived from automation.conditions.and[0]. */
  nodeId?: string;
}
