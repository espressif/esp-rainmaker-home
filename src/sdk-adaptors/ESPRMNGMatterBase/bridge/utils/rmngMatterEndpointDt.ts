/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Matter device type ids (decimal) that support level / color (Matter spec). */
const MATTER_DT_WITH_LEVEL = new Set([257, 267, 268, 269]);
const MATTER_DT_WITH_COLOR = new Set([268, 269]);

/** 0x0013 Matter Bridged Node — metadata only, not a separate controllable device. */
export const MATTER_DT_BRIDGED_NODE = 19;

function parseDtToken(dt: unknown): number | undefined {
    if (typeof dt === "number" && !Number.isNaN(dt)) return dt;
    const raw = String(dt ?? "").trim();
    if (!raw) return undefined;
    const parsed = raw.startsWith("0x") || raw.startsWith("0X")
        ? parseInt(raw, 16)
        : parseInt(raw, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Endpoint `dt` from firmware — single hex/string or list when multiple types share an endpoint.
 */
export function parseEndpointDeviceTypes(
    epData: Record<string, unknown> | undefined,
): number[] {
    if (!epData) return [];
    const raw = epData.dt;
    if (raw == null) return [];
    const items = Array.isArray(raw) ? raw : [raw];
    const types: number[] = [];
    for (const item of items) {
        const parsed = parseDtToken(item);
        if (parsed !== undefined) types.push(parsed);
    }
    return types;
}

export function matterDeviceTypeSupportsLevel(matterDt: number): boolean {
    return MATTER_DT_WITH_LEVEL.has(matterDt);
}

export function matterDeviceTypeSupportsColor(matterDt: number): boolean {
    return MATTER_DT_WITH_COLOR.has(matterDt);
}

export function matterDeviceTypeHexLabel(matterDt: number): string {
    return `0x${matterDt.toString(16).padStart(4, "0")}`;
}

/**
 * Picks one capability-bearing dt for bridged-endpoint device build.
 * Returns undefined for on/off-only lists so cluster inference drives level/color.
 */
export function pickPrimaryEndpointDeviceType(dtList: number[]): number | undefined {
    const controllable = dtList.filter((dt) => dt !== MATTER_DT_BRIDGED_NODE);
    const color = controllable.find(matterDeviceTypeSupportsColor);
    if (color !== undefined) return color;
    const level = controllable.find(matterDeviceTypeSupportsLevel);
    if (level !== undefined) return level;
    return undefined;
}
