/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Field-level param merge — avoids replacing the whole param object on live updates. */
export function mergeParamFields(
    existingParam: Record<string, unknown>,
    incoming: unknown,
): void {
    if (existingParam == null || incoming === undefined) return;
    if (typeof incoming !== "object" || incoming === null || Array.isArray(incoming)) {
        existingParam.value = incoming;
        return;
    }
    for (const key of Object.keys(incoming as Record<string, unknown>)) {
        existingParam[key] = (incoming as Record<string, unknown>)[key];
    }
}
