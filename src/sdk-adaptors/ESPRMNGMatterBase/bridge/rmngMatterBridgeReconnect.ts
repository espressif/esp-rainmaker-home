/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDF } from "@store";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { applyRefreshedCdfNodeToStore } from "@sdk-adaptors/ESPRMNGBase/utils/rmngApplyRefreshedNodeToStore";
import {
    isBridgeParentCdfNode,
    isBridgedRmngMatterCdfNode,
} from "./rmngMatterBridgeKind";
import {
    ensureBridgedChildMatterLocalFromParent,
} from "./rmngMatterBridgeDiscovery";
import { listBridgedRmngMatterChildIds } from "./rmngMatterBridgeNcfg";

const BRIDGE_LOG = "[rmngBridge]";

/** Last-known shadow `online` per node — detects false→true edges for bridge reboot. */
const bridgeOnlineEdgeCache = new Map<string, boolean>();
const bridgeRefreshInFlight = new Set<string>();

/**
 * When a bridge parent's shadow reports `online: false → true`, firmware may have
 * re-assigned bridged endpoint ids without bumping `ncfg_ver`. Force-refetch parent
 * + `{parent}--*` child configs so CDF `ep_*` maps stay aligned.
 */
export function trackBridgeOnlineEdgeFromShadow(
    nodeId: string,
    shadow: unknown,
): void {
    const reported = (shadow as { state?: { reported?: { online?: boolean } } })
        ?.state?.reported;
    if (typeof reported?.online !== "boolean") return;

    const newOnline = reported.online === true;
    const lastSeen = bridgeOnlineEdgeCache.get(nodeId);
    bridgeOnlineEdgeCache.set(nodeId, newOnline);

    if (!newOnline || lastSeen !== false) return;

    const childIds = listBridgedRmngMatterChildIds(nodeId);
    if (childIds.length === 0) return;

    scheduleBridgeReconnectRefresh(nodeId);
}

/** Fire-and-forget config refresh for bridge parent and all bridged children. */
export function scheduleBridgeReconnectRefresh(parentNodeId: string): void {
    if (bridgeRefreshInFlight.has(parentNodeId)) {
        console.log(`${BRIDGE_LOG} reconnect refresh already in-flight`, parentNodeId);
        return;
    }

    const store = ESPCDF.instance?.nodeStore;
    const parent = store?.getNodeById?.(parentNodeId);
    if (!parent || !isBridgeParentCdfNode(parent)) return;

    const childIds = listBridgedRmngMatterChildIds(parentNodeId);
    if (childIds.length === 0) return;

    bridgeRefreshInFlight.add(parentNodeId);
    console.log(`${BRIDGE_LOG} bridge online edge — forcing config refresh`, {
        parentNodeId,
        childCount: childIds.length,
    });

    void refreshBridgeParentAndBridgedChildren(parentNodeId).finally(() => {
        bridgeRefreshInFlight.delete(parentNodeId);
    });
}

/** Refetches cloud config for the bridge parent and each `{parent}--*` child. */
export async function refreshBridgeParentAndBridgedChildren(
    parentNodeId: string,
): Promise<void> {
    const root = ESPCDF.instance;
    const parent = root?.nodeStore?.getNodeById?.(parentNodeId);
    if (!parent || !isBridgeParentCdfNode(parent)) return;

    const user = root?.userStore?.getAuthorizationEntityForAdaptor(
        ESPRMNGBaseAdaptorIdentifier,
    );
    if (!user?.getNodeDetails) {
        console.warn(`${BRIDGE_LOG} refreshBridgeParentAndBridgedChildren: no user adaptor`);
        return;
    }

    const ids = [parentNodeId, ...listBridgedRmngMatterChildIds(parentNodeId)];
    for (const nodeId of ids) {
        try {
            const cdfNode = await user.getNodeDetails(nodeId);
            applyRefreshedCdfNodeToStore(cdfNode);
            if (root && isBridgedRmngMatterCdfNode(cdfNode)) {
                ensureBridgedChildMatterLocalFromParent(root, nodeId);
            }
        } catch (error) {
            console.warn(`${BRIDGE_LOG} bridge reconnect refresh failed`, {
                nodeId,
                error,
            });
        }
    }
}
