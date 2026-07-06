/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFDevice } from "@store";
import type { HybridMatterParamWriteContext } from "../../utils/hybridMatterParamWrite";
import {
    parseEndpointDeviceTypes,
    pickPrimaryEndpointDeviceType,
} from "../utils/rmngMatterEndpointDt";
import { buildMatterDeviceForEndpoint } from "../../transformers/buildRmngHybridMatterDevices";
import { matterEndpointInternalDeviceName } from "../../utils/rmngMatterShadowParams";

/**
 * Builds CDF devices for a bridged Matter child: one row per owned endpoint.
 * Params are read only from the endpoint they belong to — never from siblings.
 */
export function buildBridgedChildMatterDevices(
    mergedData: Record<string, unknown>,
    preferredDeviceName?: string,
    writeContext?: HybridMatterParamWriteContext,
    ownedEndpointIds?: readonly string[],
): ESPCDFDevice[] {
    const endpoints = mergedData?.endpoints as
        | Record<string, Record<string, unknown>>
        | undefined;
    const info = mergedData?.info as { name?: string } | undefined;
    const baseName = preferredDeviceName ?? info?.name ?? "Light";

    const ownedSet =
        ownedEndpointIds && ownedEndpointIds.length > 0
            ? new Set(ownedEndpointIds.map((id) => id.toLowerCase()))
            : null;

    const devices: ESPCDFDevice[] = [];

    for (const [epId, epData] of Object.entries(endpoints ?? {})) {
        if (ownedSet && !ownedSet.has(epId.toLowerCase())) continue;

        const matterDt = pickPrimaryEndpointDeviceType(
            parseEndpointDeviceTypes(epData),
        );
        const internalName = matterEndpointInternalDeviceName(epId);
        const device = buildMatterDeviceForEndpoint(
            epId,
            epData,
            internalName,
            matterDt,
            writeContext,
        );
        if (!device) continue;
        device.displayName = `${baseName} (${epId})`;
        devices.push(device);
    }

    return devices;
}

/** Keeps only endpoints owned by this bridged child in merged Matter config. */
export function filterMergedDataToOwnedEndpoints(
    mergedData: Record<string, unknown>,
    ownedEndpointIds: readonly string[],
): Record<string, unknown> {
    if (ownedEndpointIds.length === 0) return mergedData;
    const endpoints = mergedData.endpoints as Record<string, unknown> | undefined;
    if (!endpoints) return mergedData;

    const ownedSet = new Set(ownedEndpointIds.map((id) => id.toLowerCase()));
    const scoped: Record<string, unknown> = {};
    for (const [epId, epData] of Object.entries(endpoints)) {
        if (ownedSet.has(epId.toLowerCase())) {
            scoped[epId] = epData;
        }
    }
    return { ...mergedData, endpoints: scoped };
}
