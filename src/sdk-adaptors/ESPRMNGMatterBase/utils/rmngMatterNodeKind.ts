/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { ESPRMNGNode } from "@espressif/rmng-base-sdk";

function readConfigRecord(node: ESPRMNGNode): Record<string, unknown> | undefined {
    return node.config as unknown as Record<string, unknown> | undefined;
}

export function readInnerConfig(node: ESPRMNGNode): Record<string, unknown> | undefined {
    const config = readConfigRecord(node);
    const inner = (config?.config ?? config) as Record<string, unknown> | undefined;
    return inner && typeof inner === "object" ? inner : undefined;
}

function cloudDeviceCount(node: ESPRMNGNode): number {
    const config = readConfigRecord(node);
    const inner = readInnerConfig(node);
    const fromConfig =
        (config?.devices as unknown[] | undefined) ??
        (inner?.devices as unknown[] | undefined);
    if (Array.isArray(fromConfig) && fromConfig.length > 0) {
        return fromConfig.length;
    }
    return node.devices?.length ?? 0;
}

function hasMatterEndpointConfig(node: ESPRMNGNode): boolean {
    const inner = readInnerConfig(node);
    const config = readConfigRecord(node);
    const endpoints =
        (inner?.endpoints as Record<string, unknown> | undefined) ??
        (config?.endpoints as Record<string, unknown> | undefined);
    return !!endpoints && typeof endpoints === "object" && Object.keys(endpoints).length > 0;
}

/**
 * Classic RainMaker cloud node: RMNG device schema, default data model, no Matter topology.
 * Used to keep rmng-only nodes on the base RMNG transform even when group/fabric
 * capability flags incorrectly imply Matter.
 */
export function isClassicRmngCloudNode(node: ESPRMNGNode): boolean {
    const config = readConfigRecord(node);
    if (!config) {
        return false;
    }

    const inner = readInnerConfig(node);
    const dataModel =
        (config.data_model as string | undefined) ??
        (inner?.data_model as string | undefined) ??
        "default";
    if (dataModel === "matter") {
        return false;
    }
    if (hasMatterEndpointConfig(node)) {
        return false;
    }

    const matterNodeId =
        (inner?.matter_node_id as string | undefined) ??
        (inner?.matterNodeId as string | undefined) ??
        (config.matter_node_id as string | undefined) ??
        (config.matterNodeId as string | undefined);
    if (typeof matterNodeId === "string" && matterNodeId.trim().length > 0) {
        return false;
    }
    if (config.Matter || config.matter || inner?.Matter || inner?.matter) {
        return false;
    }

    return cloudDeviceCount(node) > 0;
}

/**
 * RMNG + Matter hybrid: cloud RMNG device schema plus Matter endpoint config.
 */
export function isRmngMatterHybridNode(node: ESPRMNGNode): boolean {
    const inner = readInnerConfig(node);
    const config = readConfigRecord(node);
    const dataModel =
        (config?.data_model as string | undefined) ??
        (inner?.data_model as string | undefined);
    const deviceCount = cloudDeviceCount(node);
    if (deviceCount === 0) return false;
    return dataModel === "matter" || hasMatterEndpointConfig(node);
}

/**
 * Pure Matter: no RMNG cloud devices; operational id from commission / local storage.
 */
export function isRmngPureMatterNode(node: ESPRMNGNode): boolean {
    if (isRmngMatterHybridNode(node)) return false;
    // Zero cloud devices is necessary but NOT sufficient: a freshly provisioned
    // RMNG-only node whose config/shadow has not hydrated yet also reports zero
    // devices. Require positive Matter evidence (endpoint topology or a
    // matter_node_id in config) before declaring pure-Matter, so unhydrated
    // RMNG-only nodes fall through to the base RMNG transform path.
    if (cloudDeviceCount(node) !== 0) return false;
    if (hasMatterEndpointConfig(node)) return true;
    const inner = readInnerConfig(node);
    const config = readConfigRecord(node);
    const matterNodeId =
        (inner?.matter_node_id as string | undefined) ??
        (inner?.matterNodeId as string | undefined) ??
        (config?.matter_node_id as string | undefined) ??
        (config?.matterNodeId as string | undefined);
    return typeof matterNodeId === "string" && matterNodeId.trim().length > 0;
}

/** CDF-level pure-Matter check (subscription funnel). */
export function isRmngPureMatterCdfNode(node: ESPCDFNode): boolean {
    const meta = node.metadata as { isRmngMatterHybrid?: boolean } | undefined;
    if (meta?.isRmngMatterHybrid) return false;
    const nodeType = (node as { nodeType?: string }).nodeType?.toLowerCase?.();
    return nodeType === "pure_matter";
}

/** CDF-level RMNG+Matter hybrid check (subscription funnel). */
export function isRmngMatterHybridCdfNode(node: ESPCDFNode): boolean {
    const meta = node.metadata as {
        isRmngMatterHybrid?: boolean;
        isBridgedRmngMatterChild?: boolean;
    } | undefined;
    if (meta?.isRmngMatterHybrid || meta?.isBridgedRmngMatterChild) return true;
    const nodeType = (node as { nodeType?: string }).nodeType?.toLowerCase?.();
    return nodeType === "rmng_matter";
}
