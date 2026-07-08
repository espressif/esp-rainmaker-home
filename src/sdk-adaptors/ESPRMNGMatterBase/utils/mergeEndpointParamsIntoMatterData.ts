/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseEndpointHex } from "./rmngMatterTopologyHelpers";

function parseClusterHex(clusterId: number): string {
    return `0x${clusterId.toString(16)}`;
}

function parseAttributeHex(attributeId: number): string {
    return `0x${attributeId.toString(16)}`;
}

type EndpointRecord = {
    clusters?: {
        servers?: Record<string, { attributes?: Record<string, unknown> }>;
        clients?: Record<string, unknown>;
    };
};

function ensureEndpointShell(
    endpoints: Record<string, unknown>,
    epId: string,
): EndpointRecord {
    if (!endpoints[epId] || typeof endpoints[epId] !== "object") {
        endpoints[epId] = { clusters: { servers: {} } };
    }
    const epData = endpoints[epId] as EndpointRecord;
    if (!epData.clusters || typeof epData.clusters !== "object") {
        epData.clusters = { servers: {} };
    }
    if (!epData.clusters.servers || typeof epData.clusters.servers !== "object") {
        epData.clusters.servers = {};
    }
    return epData;
}

/**
 * Registers a Matter attribute path in `matter_data.endpoints` (topology only or with value).
 * Used when subscription reports carry `(endpointId, clusterId, attributeId)` metadata.
 */
export function ensureMatterDataAttributePath(
    mergedData: Record<string, unknown>,
    endpointId: number,
    clusterId: number,
    attributeId: number,
    value?: unknown,
): void {
    if (!mergedData.endpoints || typeof mergedData.endpoints !== "object") {
        mergedData.endpoints = {};
    }
    const endpoints = mergedData.endpoints as Record<string, unknown>;
    const epId = parseEndpointHex(endpointId);
    const epData = ensureEndpointShell(endpoints, epId);
    const clusterKey = parseClusterHex(clusterId);
    const servers = epData.clusters!.servers!;
    if (!servers[clusterKey]) {
        servers[clusterKey] = { attributes: {} };
    }
    const clusterData = servers[clusterKey];
    if (!clusterData.attributes || typeof clusterData.attributes !== "object") {
        clusterData.attributes = {};
    }
    const attrKey = parseAttributeHex(attributeId);
    if (value === undefined) {
        if (!(attrKey in clusterData.attributes)) {
            clusterData.attributes[attrKey] = null;
        }
        return;
    }
    const attrEntry = clusterData.attributes[attrKey];
    if (
        attrEntry != null &&
        typeof attrEntry === "object" &&
        !Array.isArray(attrEntry)
    ) {
        (attrEntry as { value?: unknown }).value = value;
    } else {
        clusterData.attributes[attrKey] = value;
    }
}

/**
 * Merges RMNG-format endpoint params into matter_data.endpoints in place.
 * Creates missing endpoint / cluster / attribute shells (RainMaker parity).
 */
export function mergeEndpointParamsIntoMergedData(
    mergedData: Record<string, unknown>,
    params: Record<string, unknown>,
): void {
    if (!mergedData.endpoints || typeof mergedData.endpoints !== "object") {
        mergedData.endpoints = {};
    }
    const endpoints = mergedData.endpoints as Record<string, unknown>;

    for (const [epId, epParams] of Object.entries(params)) {
        const epData = ensureEndpointShell(endpoints, epId);
        const clusters = (epParams as { clusters?: Record<string, unknown> })?.clusters;
        if (!clusters || typeof clusters !== "object") continue;

        const epClusters = epData.clusters!.servers as Record<
            string,
            Record<string, Record<string, unknown>>
        >;

        for (const [role, roleParams] of Object.entries(clusters)) {
            if (role !== "servers") continue;
            if (!roleParams || typeof roleParams !== "object") continue;

            for (const [clusterId, clusterParams] of Object.entries(roleParams)) {
                if (!clusterParams || typeof clusterParams !== "object") continue;
                if (!epClusters[clusterId]) {
                    epClusters[clusterId] = { attributes: {} };
                }
                const clusterData = epClusters[clusterId];
                if (!clusterData.attributes || typeof clusterData.attributes !== "object") {
                    clusterData.attributes = {};
                }

                for (const [section, sectionParams] of Object.entries(clusterParams)) {
                    if (section !== "attributes") continue;
                    if (!sectionParams || typeof sectionParams !== "object") continue;

                    const sectionData = clusterData.attributes as Record<string, unknown>;
                    for (const [attrId, attrValue] of Object.entries(sectionParams)) {
                        if (attrValue === undefined) continue;
                        const attrEntry = sectionData[attrId];
                        if (
                            attrEntry != null &&
                            typeof attrEntry === "object" &&
                            !Array.isArray(attrEntry)
                        ) {
                            (attrEntry as { value?: unknown }).value = attrValue;
                        } else {
                            sectionData[attrId] = attrValue;
                        }
                    }
                }
            }
        }
    }
}
