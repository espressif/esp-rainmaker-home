/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { mergeRmngMatterEndpointParamsIntoMerged } from "./mergeRmngMatterConfigAndParams";
import {
    isRmngMatterEndpointParamFormat,
    normalizeRmngMatterConfigToCompressed,
} from "./rmngMatterEndpointFormat";
import { LIGHT_PARAM_TO_MATTER_PATH } from "./rmngMatterTopologyHelpers";
import {
    coerceDecodedRmngMatterParamValue,
    decodeRmngMatterParamForCdf,
} from "./decodeRmngMatterParamForCdf";
import {
    isBridgedRmngMatterCdfNode,
    filterBridgedChildEndpointParams,
    getBridgedOwnedEndpointIds,
} from "../bridge/rmngMatterBridgeKind";
import { ensureBridgedChildCdfDevicesForShadow } from "../bridge/rmngMatterBridgeShadow";
import {
    mergeIncomingRmngMatterEndpointShadow,
} from "../bridge/utils/rmngMatterShadowDedupe";

export function matterEndpointInternalDeviceName(endpointId: string): string {
    const hex = String(endpointId).trim().replace(/^0x/i, "");
    return hex ? `ep_${hex.toLowerCase()}` : "ep_unknown";
}

export function nodeHasMatterEndpointSplitDevices(node: {
    devices?: { name?: string }[];
}): boolean {
    return (node.devices ?? []).some((d) => /^ep_[0-9a-f]+$/i.test(d.name ?? ""));
}

function getCompressedServers(
    epParams: Record<string, unknown>,
): Record<string, unknown> | undefined {
    const c = epParams.c as Record<string, unknown> | undefined;
    if (c?.s && typeof c.s === "object") {
        return c.s as Record<string, unknown>;
    }
    const clusters = epParams.clusters as Record<string, unknown> | undefined;
    const servers = clusters?.servers;
    return servers && typeof servers === "object"
        ? (servers as Record<string, unknown>)
        : undefined;
}

function getServerAttr(
    servers: Record<string, unknown>,
    cluster: string,
    attr: string,
): unknown {
    const clusterData = servers[cluster] as Record<string, unknown> | undefined;
    const attrs = (clusterData?.a ?? clusterData?.attributes) as
        | Record<string, unknown>
        | undefined;
    return attrs?.[attr];
}

function getAttrVal(obj: unknown): unknown {
    if (obj !== null && typeof obj === "object" && "value" in obj) {
        return (obj as { value: unknown }).value;
    }
    return obj;
}

type CdfParamMatterPath = {
    endpoint?: string;
    role?: string;
    cluster?: string;
    type?: string;
    attr?: string;
};

function resolveCdfParamMatterPath(param: {
    name?: string;
    _matterPath?: CdfParamMatterPath;
    _raw?: { _matterPath?: CdfParamMatterPath };
}): CdfParamMatterPath | undefined {
    return param._matterPath ?? param._raw?._matterPath;
}

function applyEndpointTreeToDeviceParams(
    target: Record<string, unknown>,
    epParams: Record<string, unknown>,
): void {
    const servers = getCompressedServers(epParams);
    if (!servers) return;

    for (const [paramName, path] of Object.entries(LIGHT_PARAM_TO_MATTER_PATH)) {
        const raw = getAttrVal(getServerAttr(servers, path.cluster, path.attribute));
        if (raw === undefined) continue;
        target[paramName === "ColorTemperature" ? "CCT" : paramName] =
            coerceDecodedRmngMatterParamValue(
                decodeRmngMatterParamForCdf(paramName, raw),
            );
    }
}

/** Maps RMNG endpoint-keyed shadow params (`0x3.c.s…`) to CDF device-organized params. */
export function mapRmngEndpointParamsToDeviceParams(
    endpointParams: Record<string, unknown>,
    devices: {
        name?: string;
        params?: {
            name?: string;
            _matterPath?: {
                endpoint?: string;
                role?: string;
                cluster?: string;
                type?: string;
                attr?: string;
            };
        }[];
    }[],
    bridgedOwnedEndpointIds?: readonly string[],
): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    const ownedSet =
        bridgedOwnedEndpointIds && bridgedOwnedEndpointIds.length > 0
            ? new Set(bridgedOwnedEndpointIds.map((id) => id.toLowerCase()))
            : null;

    for (const device of devices) {
        const deviceName = device.name ?? "";
        if (!deviceName) continue;
        result[deviceName] = result[deviceName] ?? {};

        for (const param of device.params ?? []) {
            const path = resolveCdfParamMatterPath(param);
            if (!path?.endpoint) continue;
            const ep = endpointParams[path.endpoint] as Record<string, unknown> | undefined;
            if (!ep) continue;
            const servers = getCompressedServers(ep);
            if (!servers || !path.cluster || !path.attr) continue;
            const val = getAttrVal(getServerAttr(servers, path.cluster, path.attr));
            if (val === undefined) continue;
            const paramName = param.name ?? "";
            if (paramName) {
                result[deviceName][paramName] = coerceDecodedRmngMatterParamValue(
                    decodeRmngMatterParamForCdf(paramName, val),
                );
            }
        }
    }

    // Orphan-endpoint fan-in: map each endpoint key to its `ep_*` device (or fallback).
    // For bridged children, only owned endpoints are included when ownedSet is set.
    for (const [epId, epParams] of Object.entries(endpointParams)) {
        if (!/^0x[0-9a-fA-F]+$/i.test(epId)) continue;
        if (!epParams || typeof epParams !== "object") continue;
        // Bridged children expose only their owned endpoints in the shadow.
        if (ownedSet && !ownedSet.has(epId.toLowerCase())) continue;

        const internalName = matterEndpointInternalDeviceName(epId);
        const splitDevice = devices.find((d) => (d.name ?? "") === internalName);
        const lightDevice = devices.find((d) => (d.name ?? "") === "Light");
        const matterNamedDevice = devices.find(
            (d) => (d.name ?? "") === "Matter Device",
        );
        const targetDevice =
            splitDevice ?? lightDevice ?? matterNamedDevice ?? devices[0];
        if (!targetDevice) continue;

        const targetName = targetDevice.name ?? internalName;
        if (!result[targetName]) result[targetName] = {};
        applyEndpointTreeToDeviceParams(
            result[targetName],
            epParams as Record<string, unknown>,
        );
    }

    return result;
}

export function nodeShouldMapRmngEndpointShadowParams(
    node: ESPCDFNode,
    params: Record<string, unknown>,
): boolean {
    if (!isRmngMatterEndpointParamFormat(params)) {
        return false;
    }

    if (isBridgedRmngMatterCdfNode(node)) {
        return (node.devices?.length ?? 0) > 0;
    }

    if (!node.devices?.length) {
        return false;
    }

    const meta = node.metadata as
        | {
              isRmngMatterHybrid?: boolean;
              rmngMatterMergedData?: Record<string, unknown>;
              matter_data?: { data_model?: string };
          }
        | undefined;

    return !!(
        meta?.isRmngMatterHybrid ||
        meta?.rmngMatterMergedData ||
        meta?.matter_data?.data_model === "matter" ||
        nodeHasMatterEndpointSplitDevices(node) ||
        isBridgedRmngMatterCdfNode(node)
    );
}

function mergeEndpointShadowIntoRmngMergedData(
    cdfNode: ESPCDFNode,
    endpointParams: Record<string, unknown>,
): void {
    const meta = cdfNode.metadata as
        | { rmngMatterMergedData?: Record<string, unknown> }
        | undefined;
    if (!meta?.rmngMatterMergedData) return;

    const scopedParams = filterBridgedChildEndpointParams(cdfNode, endpointParams);
    if (Object.keys(scopedParams).length === 0) return;

    const compressed = normalizeRmngMatterConfigToCompressed({
        data_model: "matter",
        endpoints: scopedParams,
    });
    mergeRmngMatterEndpointParamsIntoMerged(
        meta.rmngMatterMergedData,
        (compressed.endpoints ?? {}) as Record<string, unknown>,
    );
}

/**
 * Rewrites MQTT shadow / params payloads keyed by Matter endpoint id into
 * device-organized CDF params (`Light` or `ep_*`).
 */
export function rewriteRmngMatterShadowParamsForCdf(
    cdfNode: ESPCDFNode,
    params: Record<string, unknown>,
): Record<string, unknown> | null {
    const incomingEndpointParams = isRmngMatterEndpointParamFormat(params)
        ? filterBridgedChildEndpointParams(cdfNode, params)
        : params;

    let scopedParams: Record<string, unknown> = incomingEndpointParams;

    if (isRmngMatterEndpointParamFormat(incomingEndpointParams)) {
        const merged = mergeIncomingRmngMatterEndpointShadow(
            cdfNode.id,
            incomingEndpointParams,
        );
        if (merged === null) {
            return null;
        }
        scopedParams = merged;
        ensureBridgedChildCdfDevicesForShadow(cdfNode, incomingEndpointParams);
    }

    if (!nodeShouldMapRmngEndpointShadowParams(cdfNode, scopedParams)) {
        if (
            isBridgedRmngMatterCdfNode(cdfNode) &&
            isRmngMatterEndpointParamFormat(incomingEndpointParams)
        ) {
            mergeEndpointShadowIntoRmngMergedData(cdfNode, incomingEndpointParams);
        }
        if (!isRmngMatterEndpointParamFormat(incomingEndpointParams)) {
            return params;
        }
        // Endpoint-keyed Matter shadow — fall through to map onto `ep_*` devices.
    }

    mergeEndpointShadowIntoRmngMergedData(cdfNode, incomingEndpointParams);

    const ownedIds = isBridgedRmngMatterCdfNode(cdfNode)
        ? getBridgedOwnedEndpointIds(cdfNode)
        : undefined;
    const mapSource = isRmngMatterEndpointParamFormat(incomingEndpointParams)
        ? incomingEndpointParams
        : scopedParams;
    const mapped = mapRmngEndpointParamsToDeviceParams(
        mapSource,
        cdfNode.devices ?? [],
        ownedIds,
    );
    const keys = Object.keys(mapped);
    if (keys.length === 0) return params;

    return mapped;
}

/**
 * Maps hybrid / bridged MQTT shadow params to CDF device keys (`ep_*`, `Power`, …).
 * Falls back when merge dedupe returns null or devices were seeded mid-flight.
 */
export function resolveRmngMatterShadowPayloadForCdf(
    cdfNode: ESPCDFNode,
    params: Record<string, unknown>,
): Record<string, unknown> | null {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
        return null;
    }

    const mapped = rewriteRmngMatterShadowParamsForCdf(cdfNode, params);
    if (mapped !== null && !isRmngMatterEndpointParamFormat(mapped)) {
        return mapped;
    }

    if (!isRmngMatterEndpointParamFormat(params)) {
        return mapped;
    }

    const ownedIds = isBridgedRmngMatterCdfNode(cdfNode)
        ? getBridgedOwnedEndpointIds(cdfNode)
        : undefined;
    const fallback = mapRmngEndpointParamsToDeviceParams(
        filterBridgedChildEndpointParams(cdfNode, params),
        cdfNode.devices ?? [],
        ownedIds,
    );
    return Object.keys(fallback).length > 0 ? fallback : mapped;
}
