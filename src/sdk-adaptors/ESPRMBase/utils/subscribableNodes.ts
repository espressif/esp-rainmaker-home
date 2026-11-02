/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNode } from "@espressif/rainmaker-base-sdk";
import type { ESPCDFNode } from "@store";

/**
 * SDK nodes to subscribe to live updates. Store nodes without SDK data are
 * left out, so they cannot fail the subscribe for every node.
 * @param nodeList - Nodes from the store
 * @param logPrefix - Log tag of the calling adaptor
 * @returns The SDK nodes that can be subscribed
 */
export function subscribableSdkNodes(
    nodeList: ESPCDFNode[],
    logPrefix: string,
): ESPRMNode[] {
    const skipped: string[] = [];
    const sdkNodes: ESPRMNode[] = [];
    for (const node of nodeList) {
        const sdkNode = node?._raw as ESPRMNode | null | undefined;
        if (sdkNode) {
            sdkNodes.push(sdkNode);
        } else if (node) {
            skipped.push(node.id);
        }
    }
    if (skipped.length > 0) {
        console.warn(`${logPrefix} subscribe skipped nodes without SDK data:`, skipped);
    }
    return sdkNodes;
}
