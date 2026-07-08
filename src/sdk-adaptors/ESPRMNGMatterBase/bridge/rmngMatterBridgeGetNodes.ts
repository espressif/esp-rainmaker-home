/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { runInAction } from "mobx";
import type { ESPCDFDevice, ESPCDFNode } from "@store";
import { ESPCDF } from "@store";
import { mergeParamFields } from "@sdk-adaptors/ESPRMNGBase/utils/mergeParamFields";
import {
    isBridgedRmngMatterCdfNode,
    parseBridgeParentNodeId,
} from "./rmngMatterBridgeKind";
import { ensureBridgedChildMatterLocalFromParent } from "./rmngMatterBridgeDiscovery";

const BRIDGE_LOG = "[rmngBridge]";

function mergeDeviceParamValues(
    targetDevices: ESPCDFDevice[],
    sourceDevices: ESPCDFDevice[],
): void {
    runInAction(() => {
        for (const srcDevice of sourceDevices) {
            const tgtDevice = targetDevices.find(
                (d) => (d.name ?? "") === (srcDevice.name ?? ""),
            );
            if (!tgtDevice?.params?.length) continue;
            for (const srcParam of srcDevice.params ?? []) {
                const name = srcParam.name ?? "";
                if (!name) continue;
                const tgtParam = tgtDevice.params.find((p) => (p.name ?? "") === name);
                if (tgtParam && srcParam.value !== undefined) {
                    mergeParamFields(
                        tgtParam as unknown as Record<string, unknown>,
                        srcParam.value,
                    );
                }
            }
        }
    });
}

/**
 * After cloud GET rebuilds a bridged child CDF node, preserve MQTT shadow param
 * values that may have landed before GET completed.
 */
export function mergeBridgedChildCdfAfterGetNodes(
    freshNode: ESPCDFNode,
    storeNode: ESPCDFNode | undefined,
): ESPCDFNode {
    if (!isBridgedRmngMatterCdfNode(freshNode) || !storeNode) return freshNode;

    const freshMeta = freshNode.metadata as Record<string, unknown>;
    const storeMeta = storeNode.metadata as
        | { rmngMatterMergedData?: Record<string, unknown> }
        | undefined;

    if (storeMeta?.rmngMatterMergedData) {
        if (!freshMeta.rmngMatterMergedData) {
            freshMeta.rmngMatterMergedData = JSON.parse(
                JSON.stringify(storeMeta.rmngMatterMergedData),
            );
        } else {
            mergeRmngMergedEndpointsFromStore(
                freshMeta.rmngMatterMergedData as Record<string, unknown>,
                storeMeta.rmngMatterMergedData,
            );
        }
    }

    const storeDevices = storeNode.devices ?? [];
    const freshDevices = freshNode.devices ?? [];

    if (storeDevices.length > 0 && freshDevices.length === 0) {
        runInAction(() => {
            freshNode.devices = storeDevices;
        });
    } else if (storeDevices.length > 0 && freshDevices.length > 0) {
        mergeDeviceParamValues(freshDevices, storeDevices);
    }

    return freshNode;
}

function mergeRmngMergedEndpointsFromStore(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
): void {
    const srcEps = source.endpoints as Record<string, unknown> | undefined;
    if (!srcEps) return;
    if (!target.endpoints) target.endpoints = {};
    const tgtEps = target.endpoints as Record<string, unknown>;
    for (const [epId, epData] of Object.entries(srcEps)) {
        if (!tgtEps[epId]) {
            tgtEps[epId] = JSON.parse(JSON.stringify(epData));
        }
    }
}

/**
 * When cloud GET rebuilds a bridged child before/after MQTT shadow landed, copy
 * online from the store child only if its shadow already reported online and the
 * bridge parent is online in this sync pass.
 */
export function applyBridgedChildConnectivityFromParent(
    childNode: ESPCDFNode,
    builtNodes: ESPCDFNode[],
): void {
    if (!isBridgedRmngMatterCdfNode(childNode)) return;

    const parentNodeId = parseBridgeParentNodeId(childNode.id);
    if (!parentNodeId) return;

    const store = ESPCDF.instance?.nodeStore;
    const parentFresh = builtNodes.find((n) => n.id === parentNodeId);
    const parentStore = store?.getNodeById?.(parentNodeId);
    const parentIsOnline =
        parentFresh?.connectivityStatus?.isConnected === true ||
        parentStore?.connectivityStatus?.isConnected === true;
    if (!parentIsOnline) return;

    const storeChild = store?.getNodeById?.(childNode.id);
    // Child MQTT shadow takes precedence: preserve online across a GET race only
    // when the store already reflects shadow online — never from mqtt
    // transportOrder or stale endpoint params.
    if (storeChild?.connectivityStatus?.isConnected !== true) return;

    runInAction(() => {
        childNode.connectivityStatus = {
            ...(childNode.connectivityStatus ?? {}),
            isConnected: true,
            lastConnectionTimestamp: Date.now(),
        };
    });
    console.log(`${BRIDGE_LOG} preserved bridged child online via parent`, {
        childNodeId: childNode.id,
        parentNodeId,
    });
}

/** Post-process bridged children after a group getNodes build pass. */
export function finalizeBridgedChildrenAfterGetNodes(nodes: ESPCDFNode[]): void {
    const store = ESPCDF.instance;
    if (!store?.nodeStore) return;

    for (const node of nodes) {
        if (!isBridgedRmngMatterCdfNode(node)) continue;
        applyBridgedChildConnectivityFromParent(node, nodes);
        ensureBridgedChildMatterLocalFromParent(store, node.id);
    }
}
