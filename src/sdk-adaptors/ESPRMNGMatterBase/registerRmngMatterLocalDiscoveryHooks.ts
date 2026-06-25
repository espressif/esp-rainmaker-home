/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDF, ESPCDFNode, ESPCDFTransportConfig } from "@store";
import { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import { registerMatterLocalDiscoveryRmngHooks } from "@shared/utils/matterLocalDiscoveryRmngHooks";
import { refreshRmngPureMatterCdfNode } from "./transformers/refreshRmngPureMatterCdfNode";
import {
    ensureBridgedChildMatterLocalFromParent,
    propagateMatterLocalTransportToBridgedChildren,
    removeMatterLocalTransportFromBridgedChildren,
    shouldSkipMatterSubscriptionForCdfNode,
} from "./bridge/rmngMatterBridgeDiscovery";
import { isBridgeParentCdfNode } from "./bridge/rmngMatterBridgeKind";

let registered = false;

function onMatterLocalTransportAdded(
    store: ESPCDF,
    nodeId: string,
    transportDetails: ESPCDFTransportConfig,
): void {
    const cdfNode = store.nodeStore?.getNodeById?.(nodeId);
    if (cdfNode && isBridgeParentCdfNode(cdfNode)) {
        propagateMatterLocalTransportToBridgedChildren(store, nodeId, transportDetails);
    } else {
        ensureBridgedChildMatterLocalFromParent(store, nodeId);
    }
}

function onMatterLocalTransportRemoved(store: ESPCDF, nodeId: string): void {
    const cdfNode = store.nodeStore?.getNodeById?.(nodeId);
    if (cdfNode && isBridgeParentCdfNode(cdfNode)) {
        removeMatterLocalTransportFromBridgedChildren(store, nodeId);
    }
}

function onPureMatterStubReachable(
    store: ESPCDF,
    nodeId: string,
    cdfNode: ESPCDFNode,
): void {
    const rawWrapper = cdfNode._raw as { _rmngSdkNode?: ESPRMNGNode } | undefined;
    void refreshRmngPureMatterCdfNode({
        nodeId,
        groupId: store.getCurrentHome()?.id ?? "",
        sdkNode:
            rawWrapper?._rmngSdkNode instanceof ESPRMNGNode
                ? rawWrapper._rmngSdkNode
                : undefined,
        isMatterLocallyReachable: true,
    }).catch((error: unknown) => {
        console.warn(
            "[rmngPureMatter] pure-Matter discovery refresh failed",
            nodeId,
            error,
        );
    });
}

/** Wires RMNG Matter bridge + pure-Matter discovery hooks (idempotent). */
export function registerRmngMatterLocalDiscoveryHooks(): void {
    if (registered) return;
    registered = true;
    registerMatterLocalDiscoveryRmngHooks({
        onMatterLocalTransportAdded,
        onMatterLocalTransportRemoved,
        onPureMatterStubReachable,
        shouldSkipMatterSubscriptionForCdfNode,
    });
}
