/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import { ESPCDF } from "@store";
import type { TransformRmngNodeOptions } from "../transformers/buildRmngMatterCdfNode";
import {
    isRmngMatterEndpointParamFormat,
    type RmngMatterCompressedConfig,
} from "./rmngMatterEndpointFormat";
import { mergeRmngMatterEndpointParamsIntoMerged } from "./mergeRmngMatterConfigAndParams";

const pendingBuildParamsByNodeId = new Map<string, Record<string, unknown>>();

/** Params to apply on the next hybrid build (e.g. ncfg refresh before `getNodeDetails`). */
export function stashHybridBuildParams(
    nodeId: string,
    params: Record<string, unknown>,
): void {
    if (!params || typeof params !== "object" || Object.keys(params).length === 0) {
        return;
    }
    pendingBuildParamsByNodeId.set(nodeId, params);
}

export function consumeHybridBuildParams(
    nodeId: string,
): Record<string, unknown> | undefined {
    const pending = pendingBuildParamsByNodeId.get(nodeId);
    if (!pending) return undefined;
    pendingBuildParamsByNodeId.delete(nodeId);
    return pending;
}

/**
 * Deep-merges incoming MQTT endpoint trees into `base` (partial shadows supported).
 * Matches log shapes: full `0x1.c.s.*` trees and partial `0x6.a.0x0`-only updates.
 */
export function mergeRmngEndpointParamTrees(
    base: Record<string, unknown>,
    incoming: Record<string, unknown>,
): Record<string, unknown> {
    if (!incoming || typeof incoming !== "object" || Object.keys(incoming).length === 0) {
        return { ...base };
    }
    const merged: Record<string, unknown> = JSON.parse(
        JSON.stringify(base ?? {}),
    ) as Record<string, unknown>;
    mergeRmngMatterEndpointParamsIntoMerged(
        { endpoints: merged } as Record<string, unknown>,
        incoming,
    );
    return merged;
}

function readSdkNodeParams(node: ESPRMNGNode): Record<string, unknown> | undefined {
    const raw = (node as { params?: unknown }).params;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    const map = raw as Record<string, unknown>;
    return isRmngMatterEndpointParamFormat(map) ? map : undefined;
}

function readStoreSdkParams(nodeId: string): Record<string, unknown> | undefined {
    const storeNode = ESPCDF.instance?.nodeStore?.getNodeById?.(nodeId);
    const raw = storeNode?._raw as ESPRMNGNode | undefined;
    return raw ? readSdkNodeParams(raw) : undefined;
}

/**
 * Resolves MQTT endpoint params for hybrid CDF construction.
 * Priority: stashed (ncfg) → options.storedParams → SDK node.params → store SDK node.params.
 */
export function resolveHybridEndpointParamsForBuild(
    node: ESPRMNGNode,
    base?: TransformRmngNodeOptions,
): Record<string, unknown> {
    const pending = consumeHybridBuildParams(node.nodeId);
    if (pending && Object.keys(pending).length > 0) {
        return pending;
    }

    const fromOptions = base?.storedParams;
    if (
        fromOptions &&
        typeof fromOptions === "object" &&
        isRmngMatterEndpointParamFormat(fromOptions as Record<string, unknown>)
    ) {
        return fromOptions;
    }

    const fromNode = readSdkNodeParams(node);
    if (fromNode && Object.keys(fromNode).length > 0) {
        return fromNode;
    }

    const fromStore = readStoreSdkParams(node.nodeId);
    if (fromStore && Object.keys(fromStore).length > 0) {
        return fromStore;
    }

    return {};
}

/**
 * When local `matter_data` exists but MQTT params are present, only union endpoint
 * **schema** keys from local into cloud config — do not treat local values as params.
 */
export function unionHybridConfigEndpointsWithLocalSchema(
    cloudConfig: RmngMatterCompressedConfig,
    localEndpoints: Record<string, unknown>,
): RmngMatterCompressedConfig {
    const cloudEndpoints = cloudConfig.endpoints ?? {};
    if (!localEndpoints || Object.keys(localEndpoints).length === 0) {
        return cloudConfig;
    }
    return {
        ...cloudConfig,
        endpoints: { ...cloudEndpoints, ...localEndpoints },
    };
}
