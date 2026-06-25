/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDF, ESPCDFNode, ESPCDFTransportConfig } from "@store";
import { handleNodeTransportUpdate } from "@store";
import { MATTER_LOCAL_TRANSPORT_KEY } from "@shared/utils/constants";
import { isOperationalMatterLocalTransport } from "@shared/utils/matterLocalReachability";
import {
    isBridgeParentCdfNode,
    isBridgedRmngMatterCdfNode,
    parseBridgeParentNodeId,
} from "@sdk-adaptors/ESPRMNGMatterBase/bridge/rmngMatterBridgeKind";
import { matterEndpointInternalDeviceName } from "@sdk-adaptors/ESPRMNGMatterBase/utils/rmngMatterShadowParams";

const BRIDGE_LOG = "[rmngBridge]";

function normalizeEndpointHex(endpointId: number): string {
    return `0x${endpointId.toString(16)}`.toLowerCase();
}

function cdfChildOwnsMatterEndpoint(child: ESPCDFNode, endpointHex: string): boolean {
    const meta = child.metadata as
        | { rmngMatterMergedData?: { endpoints?: Record<string, unknown> } }
        | undefined;
    const endpoints = meta?.rmngMatterMergedData?.endpoints;
    if (endpoints && typeof endpoints === "object") {
        for (const key of Object.keys(endpoints)) {
            if (key.toLowerCase() === endpointHex) return true;
        }
    }

    const epDeviceName = matterEndpointInternalDeviceName(endpointHex);
    for (const device of child.devices ?? []) {
        if ((device.name ?? "").toLowerCase() === epDeviceName) return true;
        for (const param of device.params ?? []) {
            const path = (param as { _matterPath?: { endpoint?: string } })._matterPath
                ?.endpoint;
            if (path && path.toLowerCase() === endpointHex) return true;
        }
    }
    return false;
}

function listBridgedRmngMatterChildren(
    parentNodeId: string,
    nodes: ESPCDFNode[],
): ESPCDFNode[] {
    return nodes.filter(
        (node) =>
            parseBridgeParentNodeId(node.id) === parentNodeId &&
            isBridgedRmngMatterCdfNode(node),
    );
}

/**
 * Resolves which bridged child CDF node should receive a parent Matter subscription update.
 * Never broadcasts to all children when endpoint metadata is missing and count > 1.
 */
export function resolveBridgedChildCdfNodeForSubscription(
    parentNodeId: string,
    nodes: ESPCDFNode[],
    endpointId?: number,
): ESPCDFNode | undefined {
    const children = listBridgedRmngMatterChildren(parentNodeId, nodes);
    if (children.length === 0) return undefined;
    if (children.length === 1) return children[0];

    if (endpointId === undefined) {
        console.warn(`${BRIDGE_LOG} subscription fan-out skipped: ambiguous without endpointId`, {
            parentNodeId,
            childCount: children.length,
        });
        return undefined;
    }

    const endpointHex = normalizeEndpointHex(endpointId);
    const match = children.find((child) => cdfChildOwnsMatterEndpoint(child, endpointHex));
    if (!match) {
        console.warn(`${BRIDGE_LOG} subscription fan-out: no child owns endpoint`, {
            parentNodeId,
            endpointHex,
            childIds: children.map((c) => c.id),
        });
    }
    return match;
}

/** Removes `matter_local` from all `{parentId}--*` bridged children (parent discovery lost). */
export function removeMatterLocalTransportFromBridgedChildren(
    store: ESPCDF,
    parentNodeId: string,
): void {
    const removeTransport: ESPCDFTransportConfig = {
        type: MATTER_LOCAL_TRANSPORT_KEY,
        metadata: {},
    };

    for (const node of store.getNodesForCurrentHome?.() ?? []) {
        if (!isBridgedRmngMatterCdfNode(node)) continue;
        if (parseBridgeParentNodeId(node.id) !== parentNodeId) continue;
        handleNodeTransportUpdate(store, node.id, removeTransport, "remove");
        console.log(`${BRIDGE_LOG} removed matter_local from bridged child`, {
            parentNodeId,
            childNodeId: node.id,
        });
    }
}

/** Copies parent `matter_local` transport onto all `{parentId}--*` bridged children. */
export function propagateMatterLocalTransportToBridgedChildren(
    store: ESPCDF,
    parentNodeId: string,
    transportDetails: ESPCDFTransportConfig,
): void {
    if (!isOperationalMatterLocalTransport(transportDetails)) return;

    const meta = transportDetails.metadata as Record<string, unknown> | undefined;
    const parentTransport: ESPCDFTransportConfig = {
        ...transportDetails,
        metadata: {
            ...(meta ?? {}),
            bridgeParentNodeId: parentNodeId,
        },
    };

    for (const node of store.getNodesForCurrentHome?.() ?? []) {
        if (!isBridgedRmngMatterCdfNode(node)) continue;
        if (parseBridgeParentNodeId(node.id) !== parentNodeId) continue;
        handleNodeTransportUpdate(store, node.id, parentTransport, "add");
        console.log(`${BRIDGE_LOG} propagated matter_local to bridged child`, {
            parentNodeId,
            childNodeId: node.id,
        });
    }
}

/** When a bridged child lands in the store after its parent was already discovered. */
export function ensureBridgedChildMatterLocalFromParent(
    store: ESPCDF,
    childNodeId: string,
): void {
    const parentNodeId = parseBridgeParentNodeId(childNodeId);
    if (!parentNodeId) return;

    const child = store.nodeStore?.getNodeById?.(childNodeId);
    if (child && !isBridgedRmngMatterCdfNode(child)) return;

    const parent = store.nodeStore?.getNodeById?.(parentNodeId);
    if (!parent) return;

    const parentTransports = parent.availableTransports as
        | Record<string, ESPCDFTransportConfig>
        | undefined;
    const parentLocal = parentTransports?.[MATTER_LOCAL_TRANSPORT_KEY];
    if (!parentLocal || !isOperationalMatterLocalTransport(parentLocal)) return;

    handleNodeTransportUpdate(
        store,
        childNodeId,
        {
            ...parentLocal,
            metadata: {
                ...(parentLocal.metadata as Record<string, unknown>),
                bridgeParentNodeId: parentNodeId,
            },
        },
        "add",
    );
    console.log(`${BRIDGE_LOG} ensureBridgedChildMatterLocalFromParent`, {
        parentNodeId,
        childNodeId,
    });
}

/** Skip native Matter subscribe on bridge parents and bridged MQTT children. */
export function shouldSkipMatterSubscriptionForCdfNode(node: ESPCDFNode): boolean {
    if (isBridgeParentCdfNode(node)) return true;
    return isBridgedRmngMatterCdfNode(node);
}
