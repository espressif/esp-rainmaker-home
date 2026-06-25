/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { mergeRmngEndpointParamTrees } from "../../utils/rmngMatterHybridBuildParams";

const lastAppliedEndpointShadowByNodeId = new Map<string, Record<string, unknown>>();

function endpointShadowFingerprint(params: Record<string, unknown>): string {
    return JSON.stringify(params);
}

/**
 * Merges a partial MQTT shadow into the cached endpoint tree and returns the merged
 * snapshot. Returns `null` when the merge would not change stored state (dedupe).
 */
export function mergeIncomingRmngMatterEndpointShadow(
    nodeId: string,
    incoming: Record<string, unknown>,
): Record<string, unknown> | null {
    const previous = lastAppliedEndpointShadowByNodeId.get(nodeId) ?? {};
    const merged = mergeRmngEndpointParamTrees(previous, incoming);
    if (endpointShadowFingerprint(merged) === endpointShadowFingerprint(previous)) {
        return null;
    }
    lastAppliedEndpointShadowByNodeId.set(nodeId, merged);
    return merged;
}

/** Seed cache after ncfg refresh / full rebuild so partial shadows merge correctly. */
export function seedRmngMatterEndpointShadowCache(
    nodeId: string,
    params: Record<string, unknown>,
): void {
    if (!params || typeof params !== "object" || Object.keys(params).length === 0) {
        return;
    }
    const previous = lastAppliedEndpointShadowByNodeId.get(nodeId) ?? {};
    lastAppliedEndpointShadowByNodeId.set(
        nodeId,
        mergeRmngEndpointParamTrees(previous, params),
    );
}

/** Call after ncfg refresh or full node rebuild so the next shadow is applied. */
export function clearRmngMatterEndpointShadowDedupe(nodeId: string): void {
    lastAppliedEndpointShadowByNodeId.delete(nodeId);
}
