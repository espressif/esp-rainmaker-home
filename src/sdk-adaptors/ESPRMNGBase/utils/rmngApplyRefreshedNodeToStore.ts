/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { runInAction } from "mobx";
import { ESPCDF, ESPCDFGroup, ESPCDFNode, ESPCDFNodeTransport } from "@store";
import { mergeLocalTransportFromNodeMap } from "@shared/utils/mergeNodeListLocalTransport";
import { ESPRMNGBase } from "@espressif/rmng-base-sdk";

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
 * the same merge used in provision/sync flows, and also checks the SDK's
 * nodeBaseUrlMap as a fallback source.
 */
export function applyRefreshedCdfNodeToStore(cdfNode: ESPCDFNode): void {
    const root = ESPCDF.instance;
    const nodeStore = root?.nodeStore;
    if (!nodeStore) return;

    // Merge local transport from existing store node
    const merged = mergeLocalTransportFromNodeMap([cdfNode], nodeStore.nodesByIDMap)[0];

    const mergedTransports = merged.availableTransports as Record<string, unknown> | undefined;
    const mergedLocalBaseUrl = (mergedTransports?.local as { metadata?: { baseUrl?: string } })?.metadata?.baseUrl;

    // Fallback: if CDF store didn't have local transport, check SDK's nodeBaseUrlMap
    if (!mergedLocalBaseUrl) {
        const sdkBaseUrl = ESPRMNGBase.getNodeBaseUrl(cdfNode.id);
        if (sdkBaseUrl) {
            merged.availableTransports = {
                ...merged.availableTransports,
                local: {
                    type: ESPCDFNodeTransport.LOCAL,
                    metadata: { baseUrl: sdkBaseUrl },
                },
            };
        }
    }

    runInAction(() => {
        const stored = nodeStore.addNode(merged);
        syncGroupNodeDetails(root?.groupStore?.groupsList, stored.id, stored);
    });
}
