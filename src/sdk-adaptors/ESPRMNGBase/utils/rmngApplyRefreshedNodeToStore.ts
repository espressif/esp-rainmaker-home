/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { runInAction } from "mobx";
import { ESPCDF, ESPCDFGroup, ESPCDFNode, ESPCDFNodeTransport } from "@store";
import { mergeLocalTransportFromNodeMap } from "@shared/utils/mergeNodeListLocalTransport";

function syncGroupNodeDetails(
    groups: ESPCDFGroup[] | undefined,
    nodeId: string,
    node: ESPCDFNode,
): void {
    if (!groups?.length) return;

    const root = ESPCDF.instance;
    for (const group of groups) {
        if (group.nodeIds?.includes(nodeId)) {
            const detailsById = new Map((group.nodeDetails ?? []).map((n) => [n.id, n]));
            detailsById.set(nodeId, node);
            const nodeDetails = Array.from(detailsById.values());
            group.nodeDetails = nodeDetails;
            root?.groupStore?.updateGroup?.(group.id, { nodeDetails });
        }
        if (group.subGroups?.length) {
            syncGroupNodeDetails(group.subGroups, nodeId, node);
        }
    }
}

/**
 * Replaces a CDF node in the store using addNode (which properly re-attaches
 * the CDF synchronizer for devices/params). Preserves local transport via
 * the same merge used in provision/sync flows, falling back to the existing
 * store node's raw SDK `availableTransports` for the LAN base URL.
 */
export function applyRefreshedCdfNodeToStore(cdfNode: ESPCDFNode): void {
    const root = ESPCDF.instance;
    const nodeStore = root?.nodeStore;
    if (!nodeStore) return;

    // Merge local transport from existing store node
    const registered =
        root?.subscriptionStore?.getRegisteredTransportsSnapshot?.() ?? {};
    const merged = mergeLocalTransportFromNodeMap(
        [cdfNode],
        nodeStore.nodesByIDMap,
        registered,
    )[0];

    const mergedTransports = merged.availableTransports as Record<string, unknown> | undefined;
    const mergedLocalBaseUrl = (mergedTransports?.local as { metadata?: { baseUrl?: string } })?.metadata?.baseUrl;

    // Fallback: if the CDF merge didn't carry a local transport, read it from the
    // existing store node's raw SDK instance (the live ESPRMNGNode that local
    // discovery applied via addTransport). The new SDK has no global
    // node-baseUrl map (ESPRMNGBase.getNodeBaseUrl was removed) — the LAN
    // transport now lives per-node on availableTransports.
    if (!mergedLocalBaseUrl) {
        const existingRaw = nodeStore.getNodeById(cdfNode.id)?._raw as
            | { availableTransports?: Record<string, { metadata?: { baseUrl?: string } }> }
            | undefined;
        const rawBaseUrl =
            existingRaw?.availableTransports?.[ESPCDFNodeTransport.LOCAL]?.metadata?.baseUrl;
        if (rawBaseUrl) {
            const localCfg = {
                type: ESPCDFNodeTransport.LOCAL,
                metadata: { baseUrl: rawBaseUrl },
            };
            merged.availableTransports = {
                ...merged.availableTransports,
                [ESPCDFNodeTransport.LOCAL]: localCfg,
            };
            // Mirror onto the refreshed raw node so the SDK still routes local.
            const raw = merged._raw as
                | { availableTransports?: Record<string, unknown> }
                | undefined;
            if (raw && typeof raw === "object") {
                raw.availableTransports = {
                    ...(raw.availableTransports || {}),
                    [ESPCDFNodeTransport.LOCAL]: localCfg,
                };
            }
        }
    }

    runInAction(() => {
        const stored = nodeStore.addNode(merged);
        syncGroupNodeDetails(root?.groupStore?.groupsList, stored.id, stored);
    });
}
