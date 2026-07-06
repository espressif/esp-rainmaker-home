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
    parseBridgeParentNodeId,
} from "./rmngMatterBridgeKind";
import { ensureBridgedChildMatterLocalFromParent } from "./rmngMatterBridgeDiscovery";

const BRIDGE_LOG = "[rmngBridge]";

/** Lists `{parentId}--*` child node ids currently in the CDF store. */
export function listBridgedRmngMatterChildIds(parentNodeId: string): string[] {
    const store = ESPCDF.instance?.nodeStore;
    const list = store?.nodesList ?? [];
    return list
        .filter(
            (node) =>
                isBridgedRmngMatterCdfNode(node) &&
                parseBridgeParentNodeId(node.id) === parentNodeId,
        )
        .map((node) => node.id);
}

/**
 * Drops bridged children from the local CDF store after their bridge parent is
 * removed from the account. The cloud sweeps these nodes; a full refresh would
 * omit them — this keeps the home UI consistent immediately.
 */
export function removeBridgedChildrenFromStore(parentNodeId: string): void {
    const nodeStore = ESPCDF.instance?.nodeStore;
    if (!nodeStore) return;

    const childIds = listBridgedRmngMatterChildIds(parentNodeId);
    if (childIds.length === 0) return;

    for (const childId of childIds) {
        if (!nodeStore.getNodeById(childId)) continue;
        try {
            nodeStore.deleteNode(childId);
        } catch (error) {
            console.warn(
                `${BRIDGE_LOG} removeBridgedChildrenFromStore failed`,
                { childId, error },
            );
        }
    }

    console.log(`${BRIDGE_LOG} removed bridged children from store after parent delete`, {
        parentNodeId,
        childIds,
    });
}

/**
 * When a bridge parent's cloud config version changes, refresh each bridged
 * BLE-Mesh child so CDF devices/params match the updated parent topology.
 */
export async function refreshBridgedChildrenAfterParentNcfg(
    parentNodeId: string,
): Promise<void> {
    const root = ESPCDF.instance;
    const parent = root?.nodeStore?.getNodeById?.(parentNodeId);
    if (!parent || !isBridgeParentCdfNode(parent)) return;

    const childIds = listBridgedRmngMatterChildIds(parentNodeId);
    if (childIds.length === 0) return;

    const user = root?.userStore?.getAuthorizationEntityForAdaptor(
        ESPRMNGBaseAdaptorIdentifier,
    );
    if (!user?.getNodeDetails) {
        console.warn(`${BRIDGE_LOG} refreshBridgedChildrenAfterParentNcfg: no user adaptor`);
        return;
    }

    console.log(`${BRIDGE_LOG} refreshing bridged children after parent ncfg`, {
        parentNodeId,
        childIds,
    });

    for (const childId of childIds) {
        try {
            const cdfNode = await user.getNodeDetails(childId);
            applyRefreshedCdfNodeToStore(cdfNode);
            if (root) {
                ensureBridgedChildMatterLocalFromParent(root, childId);
            }
        } catch (error) {
            console.warn(
                `${BRIDGE_LOG} refreshBridgedChildrenAfterParentNcfg failed`,
                { childId, error },
            );
        }
    }
}
