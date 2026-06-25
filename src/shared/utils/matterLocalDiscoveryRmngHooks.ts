/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDF, ESPCDFNode, ESPCDFTransportConfig } from "@store";

/** RMNG Matter side effects for {@link matterLocalDiscovery} (registered from sdk-adaptors). */
export type MatterLocalDiscoveryRmngHooks = {
    /** Bridge parent / bridged child: propagate or inherit `matter_local` transport. */
    onMatterLocalTransportAdded?: (
        store: ESPCDF,
        nodeId: string,
        transportDetails: ESPCDFTransportConfig,
    ) => void;
    /** Bridge parent: strip propagated `matter_local` from bridged children. */
    onMatterLocalTransportRemoved?: (store: ESPCDF, nodeId: string) => void;
    /** Pure-Matter offline stub: rebuild CDF when operational discovery attaches. */
    onPureMatterStubReachable?: (
        store: ESPCDF,
        nodeId: string,
        cdfNode: ESPCDFNode,
    ) => void;
    /** Bridge parent / bridged child: skip native Matter attribute subscribe. */
    shouldSkipMatterSubscriptionForCdfNode?: (node: ESPCDFNode) => boolean;
};

let hooks: MatterLocalDiscoveryRmngHooks | null = null;

/** Installs the RMNG-side hooks the Matter local-discovery flow calls into. */
export function registerMatterLocalDiscoveryRmngHooks(
    next: MatterLocalDiscoveryRmngHooks,
): void {
    hooks = next;
}

/** Returns the registered RMNG local-discovery hooks, or null if unset. */
export function getMatterLocalDiscoveryRmngHooks(): MatterLocalDiscoveryRmngHooks | null {
    return hooks;
}

/** Test-only: clears the registered RMNG local-discovery hooks. */
export function resetMatterLocalDiscoveryRmngHooksForTests(): void {
    hooks = null;
}
