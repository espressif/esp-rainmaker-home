/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNeoNode } from "@espressif/rainmaker-neo-base-sdk";
import type { ESPCDFNode } from "@store";

export type RmneoNcfgConfigRefreshContext = {
  nodeId: string;
  shadowParams?: Record<string, unknown>;
  oldRaw?: ESPRMNeoNode;
  mergedShadowParams?: Record<string, unknown>;
  refreshedNode?: ESPCDFNode;
};

export type RmneoNcfgRefreshHooks = {
  onRefreshStart?: (nodeId: string) => void;
  mergeShadowParams?: (
    base: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ) => Record<string, unknown>;
  onShadowParamsMerged?: (
    nodeId: string,
    merged: Record<string, unknown>,
  ) => void;
  onRefreshComplete?: (
    ctx: RmneoNcfgConfigRefreshContext,
  ) => Promise<void> | void;
};

let hooks: RmneoNcfgRefreshHooks | undefined;

/** Matter layer registers bridge/hybrid ncfg handling; base uses shallow merge when unset. */
export function registerRmneoNcfgRefreshHooks(next: RmneoNcfgRefreshHooks): void {
  hooks = next;
}

export function resetRmneoNcfgRefreshHooks(): void {
  hooks = undefined;
}

export function getRmneoNcfgRefreshHooks(): RmneoNcfgRefreshHooks | undefined {
  return hooks;
}

/** Default RMNeo-only merge when no Matter hook is registered. */
export function defaultMergeRmneoShadowParams(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, ...incoming };
}
