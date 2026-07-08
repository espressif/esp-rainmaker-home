/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** RMNG expanded keys → compressed internal keys (target naming). */
const ROLE_TO_COMPRESSED: Record<string, string> = { servers: "s", clients: "c" };
const SECTION_TO_COMPRESSED: Record<string, string> = {
    attributes: "a",
    events: "e",
    commands: "c",
};
const COMPRESSED_TO_ROLE: Record<string, string> = { s: "servers", c: "clients" };
const COMPRESSED_TO_SECTION: Record<string, string> = {
    a: "attributes",
    e: "events",
    c: "commands",
};
const SCHEMA_TO_COMPRESSED: Record<string, string> = { data_type: "dt", properties: "p" };

export interface RmngMatterCompressedConfig {
    data_model?: string;
    info?: Record<string, unknown>;
    endpoints: Record<string, unknown>;
}

export function isRmngMatterEndpointParamFormat(
    params: Record<string, unknown>,
): boolean {
    const keys = Object.keys(params);
    if (keys.length === 0) return false;
    return keys.every((key) => {
        if (!/^0x[0-9a-fA-F]+$/i.test(key)) return false;
        const entry = params[key] as Record<string, unknown> | undefined;
        return !!(entry?.clusters ?? entry?.c);
    });
}

export function isRmngMatterEndpointConfig(
    config: { endpoints?: Record<string, unknown> },
): boolean {
    const endpoints = config?.endpoints;
    if (!endpoints || typeof endpoints !== "object") return false;
    for (const ep of Object.values(endpoints)) {
        const record = ep as Record<string, unknown> | undefined;
        if (record?.clusters || record?.c) return true;
    }
    return false;
}

/**
 * Normalizes RMNG/native `clusters/servers/attributes` config into compressed
 * `c/s/a` shape used for config+params merge in the target adaptor.
 */
export function normalizeRmngMatterConfigToCompressed(
    config: {
        data_model?: string;
        info?: Record<string, unknown>;
        endpoints?: Record<string, unknown>;
    },
): RmngMatterCompressedConfig {
    const endpoints = config?.endpoints ?? {};
    const normalized: Record<string, unknown> = {};

    for (const [epId, epConfig] of Object.entries(endpoints)) {
        const epRecord = epConfig as Record<string, unknown> | undefined;
        if (!epRecord) continue;

        if (epRecord.c && typeof epRecord.c === "object") {
            normalized[epId] = { ...epRecord };
            continue;
        }

        const clusters = epRecord.clusters as Record<string, unknown> | undefined;
        if (!clusters || typeof clusters !== "object") {
            normalized[epId] = { ...epRecord };
            continue;
        }

        const compressed: Record<string, unknown> = {};
        for (const [role, clusterMap] of Object.entries(clusters)) {
            if (!clusterMap || typeof clusterMap !== "object") continue;
            const roleKey = ROLE_TO_COMPRESSED[role] ?? role;
            compressed[roleKey] = {};
            const roleOut = compressed[roleKey] as Record<string, unknown>;

            for (const [clusterId, clusterConfig] of Object.entries(
                clusterMap as Record<string, unknown>,
            )) {
                if (!clusterConfig || typeof clusterConfig !== "object") continue;
                const clusterOut: Record<string, unknown> = {};
                for (const [section, sectionConfig] of Object.entries(
                    clusterConfig as Record<string, unknown>,
                )) {
                    if (!sectionConfig || typeof sectionConfig !== "object") continue;
                    const sectionKey = SECTION_TO_COMPRESSED[section] ?? section;
                    const sectionOut: Record<string, unknown> = {};
                    for (const [attrId, attrConfig] of Object.entries(
                        sectionConfig as Record<string, unknown>,
                    )) {
                        if (
                            typeof attrConfig === "object" &&
                            attrConfig !== null &&
                            !Array.isArray(attrConfig)
                        ) {
                            const attrOut: Record<string, unknown> = {};
                            for (const [k, v] of Object.entries(attrConfig)) {
                                attrOut[SCHEMA_TO_COMPRESSED[k] ?? k] = v;
                            }
                            sectionOut[attrId] = attrOut;
                        } else {
                            sectionOut[attrId] = attrConfig;
                        }
                    }
                    clusterOut[sectionKey] = sectionOut;
                }
                roleOut[clusterId] = clusterOut;
            }
        }
        normalized[epId] = { c: compressed };
        if (epRecord.dt) {
            (normalized[epId] as Record<string, unknown>).dt = epRecord.dt;
        }
    }

    return {
        data_model: config?.data_model,
        info: config?.info,
        endpoints: normalized,
    };
}

/** Expands compressed merge output back to RMNG `clusters/servers/attributes` for metadata conversion. */
export function compressedEndpointsToRmngEndpoints(
    endpoints: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (!endpoints || typeof endpoints !== "object") return undefined;

    const out: Record<string, unknown> = {};
    for (const [epId, epData] of Object.entries(endpoints)) {
        const epRecord = epData as Record<string, unknown> | undefined;
        const compressed = epRecord?.c as Record<string, unknown> | undefined;
        if (!compressed) {
            out[epId] = epData;
            continue;
        }

        const clusters: Record<string, unknown> = {};
        for (const [roleKey, roleData] of Object.entries(compressed)) {
            const role = COMPRESSED_TO_ROLE[roleKey] ?? roleKey;
            clusters[role] = {};
            const roleOut = clusters[role] as Record<string, unknown>;

            for (const [clusterId, clusterData] of Object.entries(
                roleData as Record<string, unknown>,
            )) {
                const clusterOut: Record<string, unknown> = {};
                for (const [sectionKey, sectionData] of Object.entries(
                    clusterData as Record<string, unknown>,
                )) {
                    const section = COMPRESSED_TO_SECTION[sectionKey] ?? sectionKey;
                    const sectionOut: Record<string, unknown> = {};
                    for (const [attrId, attrVal] of Object.entries(
                        sectionData as Record<string, unknown>,
                    )) {
                        if (
                            typeof attrVal === "object" &&
                            attrVal !== null &&
                            !Array.isArray(attrVal) &&
                            "value" in attrVal
                        ) {
                            sectionOut[attrId] = (attrVal as { value: unknown }).value;
                        } else if (
                            typeof attrVal === "object" &&
                            attrVal !== null &&
                            !Array.isArray(attrVal)
                        ) {
                            sectionOut[attrId] = attrVal;
                        } else {
                            sectionOut[attrId] = attrVal;
                        }
                    }
                    clusterOut[section] = sectionOut;
                }
                roleOut[clusterId] = clusterOut;
            }
        }
        out[epId] = { clusters };
    }
    return out;
}
