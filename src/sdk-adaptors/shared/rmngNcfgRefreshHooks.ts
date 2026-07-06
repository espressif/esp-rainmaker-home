/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import type { ESPCDFNode } from "@store";

export type RmngNcfgConfigRefreshContext = {
  nodeId: string;
  shadowParams?: Record<string, unknown>;
  oldRaw?: ESPRMNGNode;
  mergedShadowParams?: Record<string, unknown>;
  refreshedNode?: ESPCDFNode;
};

export type RmngNcfgRefreshHooks = {
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
    ctx: RmngNcfgConfigRefreshContext,
  ) => Promise<void> | void;
};

let hooks: RmngNcfgRefreshHooks | undefined;

/** Matter layer registers bridge/hybrid ncfg handling; base uses shallow merge when unset. */
export function registerRmngNcfgRefreshHooks(next: RmngNcfgRefreshHooks): void {
  hooks = next;
}

export function resetRmngNcfgRefreshHooks(): void {
  hooks = undefined;
}

export function getRmngNcfgRefreshHooks(): RmngNcfgRefreshHooks | undefined {
  return hooks;
}

/** Default RMNG-only merge when no Matter hook is registered. */
export function defaultMergeRmngShadowParams(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, ...incoming };
}
