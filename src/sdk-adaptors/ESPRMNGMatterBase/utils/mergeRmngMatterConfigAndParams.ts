/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RmngMatterCompressedConfig } from "./rmngMatterEndpointFormat";

/**
 * Merges Matter endpoint config (schema) with live endpoint params (values).
 * Config: endpoints[ep].c.s[cluster].a[attr] = { dt, p }
 * Params:  endpoints[ep].c.s[cluster].a[attr] = value | { value }
 * Result:  endpoints[ep].c.s[cluster].a[attr] = { dt, p, value }
 */
export function mergeRmngMatterConfigAndParams(
    config: RmngMatterCompressedConfig,
    params: Record<string, unknown>,
): Record<string, unknown> {
    const endpoints = config?.endpoints ?? {};
    const mergedEndpoints: Record<string, unknown> = {};

    for (const [epId, epConfig] of Object.entries(endpoints)) {
        const epRecord = epConfig as Record<string, unknown> | undefined;
        const epParams = params[epId] as Record<string, unknown> | undefined;
        const compressed = epRecord?.c as Record<string, unknown> | undefined;

        if (!compressed || typeof compressed !== "object") {
            mergedEndpoints[epId] = { ...epRecord };
            continue;
        }

        const mergedC: Record<string, unknown> = {};
        for (const [role, clusterMap] of Object.entries(compressed)) {
            if (!clusterMap || typeof clusterMap !== "object") continue;
            const roleParams = (epParams?.c as Record<string, unknown> | undefined)?.[
                role
            ] as Record<string, unknown> | undefined;
            mergedC[role] = {};

            for (const [clusterId, clusterConfig] of Object.entries(
                clusterMap as Record<string, unknown>,
            )) {
                if (!clusterConfig || typeof clusterConfig !== "object") continue;
                const clusterParams = roleParams?.[clusterId] as
                    | Record<string, unknown>
                    | undefined;
                const mergedCluster: Record<string, unknown> = {};

                for (const [section, sectionConfig] of Object.entries(
                    clusterConfig as Record<string, unknown>,
                )) {
                    if (sectionConfig == null) continue;
                    if (Array.isArray(sectionConfig)) {
                        mergedCluster[section] = [...sectionConfig];
                        continue;
                    }
                    if (typeof sectionConfig !== "object") continue;

                    const sectionParams = clusterParams?.[section] as
                        | Record<string, unknown>
                        | undefined;
                    mergedCluster[section] = {};

                    for (const [attrId, attrConfig] of Object.entries(sectionConfig)) {
                        const attrValue =
                            typeof attrConfig === "object" &&
                            attrConfig !== null &&
                            "value" in attrConfig
                                ? (attrConfig as { value: unknown }).value
                                : sectionParams?.[attrId];
                        const entry =
                            typeof attrConfig === "object" &&
                            attrConfig !== null &&
                            !Array.isArray(attrConfig)
                                ? { ...(attrConfig as Record<string, unknown>) }
                                : {};
                        if (attrValue !== undefined && attrValue !== null) {
                            (entry as { value?: unknown }).value = attrValue;
                        }
                        (mergedCluster[section] as Record<string, unknown>)[attrId] =
                            Object.keys(entry).length > 0 ? entry : {};
                    }
                }
                (mergedC[role] as Record<string, unknown>)[clusterId] = mergedCluster;
            }
        }

        mergedEndpoints[epId] = { c: mergedC };
        if (epRecord?.dt) {
            (mergedEndpoints[epId] as Record<string, unknown>).dt = epRecord.dt;
        }
    }

    for (const [epId, epParams] of Object.entries(params)) {
        if (mergedEndpoints[epId]) continue;
        const compressed = (epParams as { c?: unknown }).c;
        if (compressed && typeof compressed === "object") {
            mergedEndpoints[epId] = { c: compressed };
        }
    }

    return {
        data_model: config?.data_model ?? "matter",
        info: config?.info ?? {},
        endpoints: mergedEndpoints,
    };
}

/** Converts config schema arrays (`a: ["0x0", …]`) into attribute value maps before param merge. */
function ensureAttributeValueMap(
    clusterData: Record<string, unknown>,
    section: string,
): Record<string, unknown> {
    const existing = clusterData[section];
    if (Array.isArray(existing)) {
        const map: Record<string, unknown> = {};
        for (const entry of existing) {
            if (typeof entry === "string") {
                map[entry] = {};
            }
        }
        clusterData[section] = map;
        return map;
    }
    if (existing && typeof existing === "object") {
        return existing as Record<string, unknown>;
    }
    const map: Record<string, unknown> = {};
    clusterData[section] = map;
    return map;
}

/** Merges compressed endpoint param tree into rmngMatterMergedData (subscription updates). */
export function mergeRmngMatterEndpointParamsIntoMerged(
    mergedData: Record<string, unknown>,
    params: Record<string, unknown>,
): void {
    if (!mergedData.endpoints) mergedData.endpoints = {};
    const endpoints = mergedData.endpoints as Record<string, unknown>;

    for (const [epId, epParams] of Object.entries(params)) {
        let epData = endpoints[epId] as Record<string, unknown> | undefined;
        if (!epData) {
            endpoints[epId] = { c: {} };
            epData = endpoints[epId] as Record<string, unknown>;
        }
        if (!epData.c) epData.c = {};

        const compressed = (epParams as { c?: Record<string, unknown> }).c;
        if (!compressed || typeof compressed !== "object") continue;

        const epC = epData.c as Record<string, unknown>;
        for (const [role, roleParams] of Object.entries(compressed)) {
            if (!roleParams || typeof roleParams !== "object") continue;
            if (!epC[role]) epC[role] = {};
            const roleData = epC[role] as Record<string, unknown>;

            for (const [clusterId, clusterParams] of Object.entries(roleParams)) {
                if (!clusterParams || typeof clusterParams !== "object") continue;
                if (!roleData[clusterId]) roleData[clusterId] = {};
                const clusterData = roleData[clusterId] as Record<string, unknown>;

                for (const [section, sectionParams] of Object.entries(clusterParams)) {
                    if (!sectionParams || typeof sectionParams !== "object") continue;
                    if (Array.isArray(sectionParams)) continue;
                    const sectionData = ensureAttributeValueMap(clusterData, section);

                    for (const [attrId, attrValue] of Object.entries(sectionParams)) {
                        if (attrValue === undefined) continue;
                        const existing = sectionData[attrId];
                        if (
                            existing != null &&
                            typeof existing === "object" &&
                            !Array.isArray(existing)
                        ) {
                            (existing as { value?: unknown }).value = attrValue;
                        } else {
                            sectionData[attrId] = { value: attrValue };
                        }
                    }
                }
            }
        }
    }
}
