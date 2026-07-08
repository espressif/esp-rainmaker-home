/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGMatterMetadataInterface } from "@espressif/rmng-matter-sdk";
import { extractParamValuesFromMatterData } from "./rmngMatterTopologyHelpers";

const RMNG_ROLES = ["servers", "clients"] as const;
const RMNG_SECTIONS = ["attributes", "events", "commands"] as const;

function parseHexId(key: string): string {
    const trimmed = key.trim();
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
        return trimmed.toLowerCase();
    }
    return `0x${parseInt(trimmed, 10).toString(16)}`;
}

function collectAttributeIds(
    sectionData: Record<string, unknown> | unknown[] | undefined,
): string[] {
    if (!sectionData || typeof sectionData !== "object") return [];
    // Persisted matter_data stores a cluster's attributes as an array of id
    // strings (["0x7","0x3",...])
    // Object.keys on the array would return indices (0,1,2,…) — a bogus low-id
    // list that makes every param look supported and defeats attribute gating
    // (e.g. Hue/Saturation surviving on an XY+CCT light). Use the ids directly.
    const ids = Array.isArray(sectionData)
        ? sectionData
        : Object.keys(sectionData);
    return ids.map((id) => parseHexId(String(id)));
}

function convertEndpointClusters(
    clusters: Record<string, unknown> | undefined,
): Record<string, { attributes?: string[] | null }> | undefined {
    if (!clusters || typeof clusters !== "object") return undefined;

    const servers: Record<string, { attributes?: string[] | null }> = {};

    for (const [roleKey, roleValue] of Object.entries(clusters)) {
        const role = RMNG_ROLES.find((r) => r === roleKey)
        if (role !== "servers" || !roleValue || typeof roleValue !== "object") {
            continue;
        }

        for (const [clusterKey, clusterValue] of Object.entries(
            roleValue as Record<string, unknown>,
        )) {
            if (!clusterValue || typeof clusterValue !== "object") continue;
            const clusterId = parseHexId(clusterKey);
            const attrs: string[] = [];

            for (const [sectionKey, sectionValue] of Object.entries(
                clusterValue as Record<string, unknown>,
            )) {
                const section = RMNG_SECTIONS.find((s) => s === sectionKey)
                if (section === "attributes" && sectionValue && typeof sectionValue === "object") {
                    attrs.push(
                        ...collectAttributeIds(
                            sectionValue as Record<string, unknown> | unknown[],
                        ),
                    );
                }
            }

            if (attrs.length > 0) {
                servers[clusterId] = { attributes: [...new Set(attrs)] };
            }
        }
    }

    return Object.keys(servers).length > 0 ? { servers } : undefined;
}

/**
 * Converts locally stored `matter_data` (RMNG/native endpoint shape) into
 * `metadata.Matter` for {@link ESPRMNGMatterNode.fromMatterMetaData}.
 */
export function matterDataToEspMetadata(
    matterData: Record<string, unknown> | undefined,
    fallback?: { deviceName?: string; deviceType?: number },
): ESPRMNGMatterMetadataInterface | undefined {
    if (!matterData || typeof matterData !== "object") return undefined;

    const endpointsIn = matterData.endpoints as Record<string, unknown> | undefined;
    if (!endpointsIn || typeof endpointsIn !== "object") {
        if (fallback?.deviceName || fallback?.deviceType != null) {
            return {
                deviceName: fallback.deviceName,
                deviceType: fallback.deviceType,
            };
        }
        return undefined;
    }

    const endpoints: ESPRMNGMatterMetadataInterface["endpoints"] = {};

    for (const [epKey, epValue] of Object.entries(endpointsIn)) {
        if (!epValue || typeof epValue !== "object") continue;
        const epRecord = epValue as Record<string, unknown>;
        const clusters =
            (epRecord.clusters as Record<string, unknown> | undefined) ??
            (epRecord.c as Record<string, unknown> | undefined);
        const converted = convertEndpointClusters(clusters);
        if (!converted) continue;
        endpoints[parseHexId(epKey)] = { clusters: converted };
    }

    if (Object.keys(endpoints).length === 0) return undefined;

    const info = matterData.info as { name?: string; type?: number } | undefined;
    return {
        deviceName: fallback?.deviceName ?? info?.name,
        deviceType: fallback?.deviceType ?? info?.type,
        endpoints,
    };
}

/** Pulls flat param values from matter_data endpoint attribute values. */
export function extractStoredParamsFromMatterData(
    matterData: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    return extractParamValuesFromMatterData(matterData);
}
