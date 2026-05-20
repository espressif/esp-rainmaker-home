/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const inflightByNodeId = new Map<string, Promise<void>>();

/**
 * Runs shadow-side ncfg work once per node while duplicate MQTT handlers are active.
 * @returns `true` for the leader (may emit CDF updates); `false` for waiters.
 */
export async function runNcfgShadowHandlerCoalesced(
    nodeId: string,
    work: () => Promise<void>,
): Promise<boolean> {
    const existing = inflightByNodeId.get(nodeId);
    if (existing) {
        await existing;
        return false;
    }

    const promise = work().finally(() => {
        inflightByNodeId.delete(nodeId);
    });
    inflightByNodeId.set(nodeId, promise);
    await promise;
    return true;
}
