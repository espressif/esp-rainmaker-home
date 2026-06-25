/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const PURE_MATTER_LOG = "[rmngPureMatter]";

/** Logs the full raw `matter_data` object (pretty-printed JSON). */
export function logRawMatterData(
    nodeId: string,
    context: string,
    matterData: unknown,
): void {
    try {
        console.log(
            `${PURE_MATTER_LOG} matter_data raw [${context}] nodeId=${nodeId}:`,
            JSON.stringify(matterData ?? null, null, 2),
        );
    } catch (error) {
        console.warn(
            `${PURE_MATTER_LOG} matter_data raw log failed [${context}] nodeId=${nodeId}:`,
            error,
            matterData,
        );
    }
}
