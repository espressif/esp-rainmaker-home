/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import {
    deriveMatterNodeIdFromThingName,
    resolveOperationalMatterNodeId,
} from "@shared/utils/matterLocalStorage";
import { isRmngMatterHybridNode, readInnerConfig } from "../utils/rmngMatterNodeKind";
import { parseEndpointDeviceTypes } from "./utils/rmngMatterEndpointDt";

/** Matter infrastructure node (border router / bridge chip). */
export const BRIDGE_PARENT_DEVICE_TYPE = "esp.device.thread-br";

/** Bridged RMNG+Matter child ids: `{parentNodeId}--{suffix}`. */
export function parseBridgeParentNodeId(nodeId: string): string | null {
    const sep = nodeId.indexOf("--");
    if (sep <= 0) return null;
    const parentNodeId = nodeId.slice(0, sep);
    return parentNodeId.length > 0 ? parentNodeId : null;
}

/** Id-shape hint only — prefer {@link isBridgedRmngMatterChildNode} at build time. */
export function isBridgedRmngMatterChildId(nodeId: string): boolean {
    return parseBridgeParentNodeId(nodeId) != null;
}

function hasRmngMatterChildConfig(node: ESPRMNGNode): boolean {
    const config = node.config as unknown as Record<string, unknown> | undefined;
    const inner = readInnerConfig(node);
    const dataModel =
        (config?.data_model as string | undefined) ??
        (inner?.data_model as string | undefined);
    if (dataModel === "matter") return true;

    const endpoints =
        (inner?.endpoints as Record<string, unknown> | undefined) ??
        (config?.endpoints as Record<string, unknown> | undefined);
    if (endpoints && typeof endpoints === "object" && Object.keys(endpoints).length > 0) {
        return true;
    }

    return isRmngMatterHybridNode(node);
}

/**
 * True when an RMNG SDK node is a bridged Matter child under a bridge parent.
 * Requires `{parentId}--{suffix}` **and** Matter endpoint config — not id shape alone.
 */
export function isBridgedRmngMatterChildNode(node: ESPRMNGNode): boolean {
    if (!parseBridgeParentNodeId(node.nodeId)) return false;
    if (isBridgeParentNode(node)) return false;
    return hasRmngMatterChildConfig(node);
}

/** True when the node is a Matter bridge parent (infrastructure only, no UI params). */
export function isBridgeParentNode(node: ESPRMNGNode): boolean {
    const config = node.config as unknown as Record<string, unknown> | undefined;
    const inner = readInnerConfig(node);
    const infoType =
        (inner?.info as { type?: string | number } | undefined)?.type ??
        (config?.info as { type?: string | number } | undefined)?.type;
    if (infoType === BRIDGE_PARENT_DEVICE_TYPE || infoType === 14 || infoType === "14") {
        return true;
    }

    for (const device of node.devices ?? []) {
        if (device.type === BRIDGE_PARENT_DEVICE_TYPE) return true;
    }

    const endpoints =
        (inner?.endpoints as Record<string, unknown> | undefined) ??
        (config?.endpoints as Record<string, unknown> | undefined);
    if (endpoints && typeof endpoints === "object") {
        for (const ep of Object.values(endpoints)) {
            const dt = (ep as { dt?: number | string })?.dt;
            if (dt === 14 || dt === "14" || dt === "0xe") return true;
        }
    }
    return false;
}

export function isBridgeParentCdfNode(node: ESPCDFNode): boolean {
    const meta = node.metadata as { isBridgeParent?: boolean } | undefined;
    if (meta?.isBridgeParent) return true;
    return (node.devices ?? []).some((d) => d.type === BRIDGE_PARENT_DEVICE_TYPE);
}

/** CDF bridged child — set at build time in bridge/transformers/buildRmngBridgedMatterCdfNode. */
export function isBridgedRmngMatterCdfNode(node: ESPCDFNode): boolean {
    const meta = node.metadata as { isBridgedRmngMatterChild?: boolean } | undefined;
    return meta?.isBridgedRmngMatterChild === true;
}

export type BridgedChildMatterControlContext = {
    parentNodeId: string;
    parentMatterNodeId: string;
};

function readMatterNodeIdFromCdfNode(node: ESPCDFNode | undefined): string | undefined {
    if (!node) return undefined;
    const direct = (node as { matterNodeId?: string }).matterNodeId;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const meta = node.metadata as
        | { matter_node_id?: string; matterNodeId?: string }
        | undefined;
    return meta?.matter_node_id ?? meta?.matterNodeId;
}

/**
 * Resolves parent operational Matter id for a bridged RMNG+Matter child.
 * Local read/write/invoke uses the parent's Matter CASE session.
 */
export function resolveBridgedChildMatterControl(
    childNodeId: string,
    getNodeById?: (id: string) => ESPCDFNode | undefined,
): BridgedChildMatterControlContext | null {
    const parentNodeId = parseBridgeParentNodeId(childNodeId);
    if (!parentNodeId) return null;

    const parent = getNodeById?.(parentNodeId);
    const fromParentMeta = readMatterNodeIdFromCdfNode(parent);
    const parentMatterNodeId =
        fromParentMeta ??
        (resolveOperationalMatterNodeId(parentNodeId, {}) ||
            deriveMatterNodeIdFromThingName(parentNodeId));
    if (!parentMatterNodeId) return null;

    return { parentNodeId, parentMatterNodeId };
}

type BridgedChildMeta = {
    bridgedOwnedEndpointIds?: string[];
    bridgedEndpointDeviceTypes?: Record<string, number[]>;
    rmngMatterMergedData?: { endpoints?: Record<string, unknown> };
};

function recordEndpointDeviceTypes(
    meta: BridgedChildMeta,
    endpoints: Record<string, unknown>,
): void {
    const byEndpoint: Record<string, number[]> = {};
    for (const [epId, epData] of Object.entries(endpoints)) {
        const types = parseEndpointDeviceTypes(epData as Record<string, unknown>);
        if (types.length > 0) byEndpoint[epId.toLowerCase()] = types;
    }
    if (Object.keys(byEndpoint).length > 0) {
        meta.bridgedEndpointDeviceTypes = byEndpoint;
    }
}

/** Pin cloud-config endpoint ids so sibling shadow endpoints cannot bleed in. */
export function seedBridgedOwnedEndpointIds(
    meta: Record<string, unknown>,
    cdfNode?: ESPCDFNode,
): void {
    const typed = meta as BridgedChildMeta;
    if ((typed.bridgedOwnedEndpointIds?.length ?? 0) > 0) return;

    const owned = new Set<string>();
    const endpointRecords = typed.rmngMatterMergedData?.endpoints ?? {};
    for (const key of Object.keys(endpointRecords)) {
        if (key) owned.add(key.toLowerCase());
    }
    if (cdfNode) {
        for (const device of cdfNode.devices ?? []) {
            for (const param of device.params ?? []) {
                const ep = (param as { _matterPath?: { endpoint?: string } })
                    ._matterPath?.endpoint;
                if (ep) owned.add(ep.toLowerCase());
            }
        }
    }
    if (owned.size > 0) {
        typed.bridgedOwnedEndpointIds = [...owned];
        recordEndpointDeviceTypes(typed, endpointRecords);
    }
}

export function getBridgedOwnedEndpointIds(node: ESPCDFNode): readonly string[] {
    const meta = node.metadata as BridgedChildMeta | undefined;
    return meta?.bridgedOwnedEndpointIds ?? [];
}

/** Drop sibling bridge endpoints from a bridged child's MQTT shadow payload. */
export function filterBridgedChildEndpointParams(
    cdfNode: ESPCDFNode,
    endpointParams: Record<string, unknown>,
): Record<string, unknown> {
    if (!isBridgedRmngMatterCdfNode(cdfNode)) return endpointParams;

    const owned = getBridgedOwnedEndpointIds(cdfNode);
    if (owned.length === 0) return endpointParams;

    const ownedSet = new Set(owned.map((id) => id.toLowerCase()));
    const filtered: Record<string, unknown> = {};
    for (const [epId, epData] of Object.entries(endpointParams)) {
        if (ownedSet.has(epId.toLowerCase())) {
            filtered[epId] = epData;
        }
    }
    return filtered;
}
