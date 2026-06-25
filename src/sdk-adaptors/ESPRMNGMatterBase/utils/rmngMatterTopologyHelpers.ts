/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { runInAction } from "mobx";
import { ESPRMNGMatterNode } from "@espressif/rmng-matter-sdk";
import type { ESPRMNGMatterMetadataInterface } from "@espressif/rmng-matter-sdk";
import { mergeParamFields } from "@sdk-adaptors/ESPRMNGBase/utils/mergeParamFields";
import { emitMatterDeviceStateChanged } from "@shared/utils/matterDeviceStateEvents";
import { hasUsableMatterTopology } from "./rmngGroupNodeDetailsContext";
import {
    coerceDecodedRmngMatterParamValue,
    coerceMatterParamForCdf,
    decodeRmngMatterParamForCdf,
    type MatterParamDecodeContext,
} from "./decodeRmngMatterParamForCdf";

const DEFAULT_MATTER_DEVICE_NAME = "Light";

/** Param name → Matter cluster/attribute (light clusters). */
export const LIGHT_PARAM_TO_MATTER_PATH: Record<
    string,
    { cluster: string; attribute: string }
> = {
    Power: { cluster: "0x6", attribute: "0x0" },
    Brightness: { cluster: "0x8", attribute: "0x0" },
    Hue: { cluster: "0x300", attribute: "0x0" },
    Saturation: { cluster: "0x300", attribute: "0x1" },
    CCT: { cluster: "0x300", attribute: "0x7" },
    ColorTemperature: { cluster: "0x300", attribute: "0x7" },
    Temperature: { cluster: "0x402", attribute: "0x0" },
};

const DEFAULT_ENDPOINT_HEX = "0x1";

/**
 * Matter-local subscription updates name the color-temperature param "CCT"
 * (from paramNameForMatterPath), while the hybrid device builder names it
 * "ColorTemperature". Treat them as the same param so live CCT updates resolve.
 */
function normalizeColorTempParamName(name: string): string {
    const lower = (name ?? "").toLowerCase();
    return lower === "cct" ? "colortemperature" : lower;
}

type MatterPath = {
    endpoint?: string;
    role?: string;
    cluster?: string;
    type?: string;
    attr?: string;
};

export type MatterSubscriptionPathMetadata = {
    endpointId?: number;
    clusterId?: number;
    attributeId?: number;
};

export function parseEndpointHex(endpointId: number): string {
    return `0x${endpointId.toString(16)}`;
}

export function buildMatterRoutingNode(
    nodeId: string,
    matterNodeId: string,
    matterMeta?: ESPRMNGMatterMetadataInterface,
): ESPRMNGMatterNode | undefined {
    if (!matterMeta?.endpoints) return undefined;

    const matterNode = ESPRMNGMatterNode.fromMatterMetaData({
        id: nodeId,
        node_id: nodeId,
        matter_node_id: matterNodeId,
        metadata: { Matter: matterMeta },
        is_matter: true,
    });

    if (!matterNode.devices?.length) return undefined;
    return matterNode;
}

export function paramNameForMatterPath(
    clusterId: number | undefined,
    attributeId: number | undefined,
): string | undefined {
    if (clusterId === undefined || attributeId === undefined) return undefined;
    for (const [paramName, path] of Object.entries(LIGHT_PARAM_TO_MATTER_PATH)) {
        const pathCluster = parseInt(path.cluster, 16);
        const pathAttr = parseInt(path.attribute, 16);
        if (pathCluster === clusterId && pathAttr === attributeId) {
            return paramName === "ColorTemperature" ? "CCT" : paramName;
        }
    }
    return undefined;
}

export function resolveEndpointHexForParam(
    paramName: string,
    device?: { params?: { name?: string; _matterPath?: MatterPath }[] },
    subscriptionMetadata?: MatterSubscriptionPathMetadata,
): string {
    const pathParam = paramNameForMatterPath(
        subscriptionMetadata?.clusterId,
        subscriptionMetadata?.attributeId,
    );
    if (pathParam === paramName && subscriptionMetadata?.endpointId !== undefined) {
        return parseEndpointHex(subscriptionMetadata.endpointId);
    }

    const raw = device?.params?.find((p) => (p.name ?? "") === paramName)?._matterPath;
    const fromRaw = (device?.params?.find((p) => (p.name ?? "") === paramName) as
        | { _raw?: { _matterPath?: MatterPath } }
        | undefined)?._raw?._matterPath;
    const path = raw ?? fromRaw;
    const ep = path?.endpoint;
    if (!ep) return DEFAULT_ENDPOINT_HEX;
    return ep.startsWith("0x") || ep.startsWith("0X") ? ep.toLowerCase() : `0x${ep}`;
}

export function collectCdfMatterParamNames(node: ESPCDFNode): Set<string> {
    const names = new Set<string>();
    for (const device of node.devices ?? []) {
        for (const param of device?.params ?? []) {
            const name = param?.name?.trim();
            if (name) names.add(name);
        }
    }
    return names;
}

/** Infers UI param names present in persisted `matter_data.endpoints`. */
export function collectParamNamesFromMatterData(
    matterData?: Record<string, unknown> | null,
): Set<string> {
    const names = new Set<string>();
    const endpoints = matterData?.endpoints as Record<string, unknown> | undefined;
    if (!endpoints || typeof endpoints !== "object") return names;

    for (const epData of Object.values(endpoints)) {
        if (!epData || typeof epData !== "object") continue;
        const epRecord = epData as Record<string, unknown>;
        const clusters =
            (epRecord.clusters as Record<string, unknown> | undefined) ??
            (epRecord.c as Record<string, unknown> | undefined);
        if (!clusters || typeof clusters !== "object") continue;

        const servers =
            (clusters.servers as Record<string, unknown> | undefined) ??
            (clusters.s as Record<string, unknown> | undefined);
        if (!servers || typeof servers !== "object") continue;

        for (const [clusterKey, clusterData] of Object.entries(servers)) {
            if (!clusterData || typeof clusterData !== "object") continue;
            const clusterRecord = clusterData as Record<string, unknown>;
            const attributes =
                (clusterRecord.attributes as Record<string, unknown> | undefined) ??
                (clusterRecord.a as Record<string, unknown> | undefined);
            if (!attributes || typeof attributes !== "object") continue;

            const clusterId = parseInt(clusterKey, 16);
            const attrIds = Array.isArray(attributes)
              ? (attributes as unknown[])
              : Object.keys(attributes);
            for (const attrKey of attrIds) {
              const attributeId = parseInt(String(attrKey), 16);
              const paramName = paramNameForMatterPath(clusterId, attributeId);
              if (paramName) names.add(paramName);
            }
        }
    }
    return names;
}

function readMatterAttributeValue(attrEntry: unknown): unknown {
    if (
        attrEntry != null &&
        typeof attrEntry === "object" &&
        !Array.isArray(attrEntry) &&
        "value" in attrEntry
    ) {
        return (attrEntry as { value: unknown }).value;
    }
    return attrEntry;
}

/** Reads flat UI param values from persisted `matter_data.endpoints`. */
export function extractParamValuesFromMatterData(
    matterData?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
    const endpoints = matterData?.endpoints as Record<string, unknown> | undefined;
    if (!endpoints || typeof endpoints !== "object") return undefined;

    const out: Record<string, unknown> = {};
    for (const epData of Object.values(endpoints)) {
        if (!epData || typeof epData !== "object") continue;
        const epRecord = epData as Record<string, unknown>;
        const clusters =
            (epRecord.clusters as Record<string, unknown> | undefined) ??
            (epRecord.c as Record<string, unknown> | undefined);
        if (!clusters || typeof clusters !== "object") continue;

        const servers =
            (clusters.servers as Record<string, unknown> | undefined) ??
            (clusters.s as Record<string, unknown> | undefined);
        if (!servers || typeof servers !== "object") continue;

        for (const [clusterKey, clusterData] of Object.entries(servers)) {
            if (!clusterData || typeof clusterData !== "object") continue;
            const clusterRecord = clusterData as Record<string, unknown>;
            const attributes =
                (clusterRecord.attributes as Record<string, unknown> | undefined) ??
                (clusterRecord.a as Record<string, unknown> | undefined);
            if (!attributes || typeof attributes !== "object") continue;
            if (Array.isArray(attributes)) continue;

            const clusterId = parseInt(clusterKey, 16);
            for (const [attrKey, attrEntry] of Object.entries(attributes)) {
                const attributeId = parseInt(attrKey, 16);
                const paramName = paramNameForMatterPath(clusterId, attributeId);
                if (!paramName) continue;
                const raw = readMatterAttributeValue(attrEntry);
                if (raw === undefined || raw === null) continue;
                out[paramName] = coerceDecodedRmngMatterParamValue(
                    decodeRmngMatterParamForCdf(paramName, raw),
                );
            }
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function resolveMatterTargetDevice(
    node: ESPCDFNode,
    deviceParams: Record<string, unknown>,
    subscriptionMetadata?: MatterSubscriptionPathMetadata,
): { name?: string; params?: { name?: string }[] } | undefined {
    const devices = (node.devices ?? []).filter(Boolean);
    if (devices.length === 0) return undefined;

    if (subscriptionMetadata?.endpointId !== undefined) {
        const epHex = parseEndpointHex(subscriptionMetadata.endpointId);
        const epDeviceName = `ep_${epHex.replace(/^0x/i, "").toLowerCase()}`;
        const byEpName = devices.find((d) => (d.name ?? "") === epDeviceName);
        if (byEpName) return byEpName;

        const byEpPath = devices.find((d) =>
            d.params?.some((p) => {
                const ep = (p as { _matterPath?: MatterPath })._matterPath?.endpoint;
                return ep?.toLowerCase() === epHex.toLowerCase();
            }),
        );
        if (byEpPath) return byEpPath;
    }

    const paramNames = Object.keys(deviceParams);
    const byParamMatch = devices.find((d) =>
        paramNames.some((pn) => d.params?.some((p) => (p.name ?? "") === pn)),
    );
    if (byParamMatch) return byParamMatch;

    const meta = node.metadata as {
        deviceName?: string;
        Matter?: { deviceName?: string };
    };
    const preferredName =
        meta?.deviceName ??
        meta?.Matter?.deviceName ??
        (node as { matterDeviceName?: string }).matterDeviceName;
    if (preferredName) {
        const byName = devices.find((d) => (d.name ?? "") === preferredName);
        if (byName) return byName;
    }

    const byDefault = devices.find((d) => (d.name ?? "") === DEFAULT_MATTER_DEVICE_NAME);
    return byDefault ?? devices[0];
}

/** Applies flat Matter param values onto an existing CDF node (MobX-safe). */
export function applyMatterDeviceParamsToCdfNode(
    node: ESPCDFNode,
    deviceParams: Record<string, unknown>,
    subscriptionMetadata?: MatterSubscriptionPathMetadata,
    options?: { paramDecodeContext?: MatterParamDecodeContext },
): void {
    const targetDevice = resolveMatterTargetDevice(
        node,
        deviceParams,
        subscriptionMetadata,
    );
    if (!targetDevice?.params?.length) return;

    const deviceName = targetDevice.name ?? "";
    const decodeContext = options?.paramDecodeContext ?? "matter_data";
    const decodedParams: Record<string, unknown> = {};
    for (const [paramName, incoming] of Object.entries(deviceParams)) {
        if (incoming === undefined) continue;
        decodedParams[paramName] = coerceMatterParamForCdf(
            paramName,
            incoming,
            decodeContext,
        );
    }

    runInAction(() => {
        for (const [paramName, incoming] of Object.entries(decodedParams)) {
            if (incoming === undefined) continue;
            const param = targetDevice.params?.find(
              (p) =>
                (p.name ?? "") === paramName ||
                (p.name ?? "").toLowerCase() === paramName.toLowerCase() ||
                normalizeColorTempParamName(p.name ?? "") ===
                  normalizeColorTempParamName(paramName),
            );
            if (!param) continue;

            const oldValue = (param as { value?: unknown }).value;
            mergeParamFields(param as Record<string, unknown>, incoming);
            const nextValue = (param as { value?: unknown }).value;
            if (nextValue === oldValue) continue;

            node.emitPropertyChange?.({
                type: "deviceParamChanged",
                deviceName,
                paramName: param.name ?? paramName,
                value: nextValue,
                oldValue,
                entity: node,
            });
        }
    });

    syncMatterRawNodeParams(node, targetDevice, decodedParams);
    emitMatterDeviceStateChanged(node, decodedParams, {
        endpointId: subscriptionMetadata?.endpointId,
        deviceName: targetDevice?.name,
    });
}

function syncMatterRawNodeParams(
    node: ESPCDFNode,
    device: { name?: string; params?: { name?: string }[] } | undefined,
    deviceParams: Record<string, unknown>,
): void {
    const raw = node._raw as
        | {
              nodeConfig?: {
                  devices?: { name?: string; params?: { name?: string; value?: unknown }[] }[];
              };
              cdfPayload?: {
                  devices?: { name?: string; params?: { name?: string; value?: unknown }[] }[];
              };
              _routingNode?: {
                  devices?: { name?: string; params?: { name?: string; value?: unknown }[] }[];
                  nodeConfig?: {
                      devices?: { name?: string; params?: { name?: string; value?: unknown }[] }[];
                  };
              };
              _sdkDevices?: { id?: string; params?: { id?: string; value?: unknown }[] }[];
          }
        | undefined;
    if (!raw) return;

    const deviceName = device?.name ?? "";
    for (const [paramName, incoming] of Object.entries(deviceParams)) {
        if (incoming === undefined) continue;

        const sdkDevice = raw._sdkDevices?.find(
            (d) => (d.id ?? "") === deviceName || deviceName === DEFAULT_MATTER_DEVICE_NAME,
        );
        const sdkParam = sdkDevice?.params?.find((p) => (p.id ?? "") === paramName);
        if (sdkParam) sdkParam.value = incoming;

        const rawDevices =
            raw._routingNode?.nodeConfig?.devices ??
            raw._routingNode?.devices ??
            raw.nodeConfig?.devices ??
            raw.cdfPayload?.devices;
        if (!Array.isArray(rawDevices)) continue;
        const rawDevice =
            rawDevices.find((d) => (d.name ?? "") === deviceName) ?? rawDevices[0];
        const rawParam = rawDevice?.params?.find((p) => (p.name ?? "") === paramName);
        if (rawParam) rawParam.value = incoming;
    }
}

export function cdfNeedsMatterParamRefresh(
    cdfNode: ESPCDFNode,
    localMeta?: Record<string, unknown> | null,
): boolean {
    const matterData = localMeta?.matter_data as Record<string, unknown> | undefined;
    if (!hasUsableMatterTopology(localMeta)) {
        return false;
    }

    const cdfMeta = cdfNode.metadata as { matter_data?: Record<string, unknown> } | undefined;
    if (!hasUsableMatterTopology(cdfMeta)) {
        return true;
    }

    const expected = collectParamNamesFromMatterData(matterData);
    if (expected.size === 0) {
        return false;
    }

    const onCdf = collectCdfMatterParamNames(cdfNode);
    for (const paramName of expected) {
        if (!onCdf.has(paramName)) {
            return true;
        }
    }
    for (const paramName of onCdf) {
        if (!expected.has(paramName)) {
            return true;
        }
    }
    return false;
}

export function registerLightParamTopologyPaths(
    matterData: Record<string, unknown>,
    paramNames: Iterable<string>,
    device?: { params?: { name?: string; _matterPath?: MatterPath }[] },
    subscriptionMetadata?: MatterSubscriptionPathMetadata,
): void {
    if (!matterData.endpoints || typeof matterData.endpoints !== "object") {
        matterData.endpoints = {};
    }
    const endpoints = matterData.endpoints as Record<string, unknown>;

    for (const paramName of paramNames) {
        const path = LIGHT_PARAM_TO_MATTER_PATH[paramName];
        if (!path) continue;
        const epId = resolveEndpointHexForParam(paramName, device, subscriptionMetadata);
        if (!endpoints[epId] || typeof endpoints[epId] !== "object") {
            endpoints[epId] = { clusters: { servers: {} } };
        }
        const epData = endpoints[epId] as {
            clusters?: { servers?: Record<string, { attributes?: Record<string, unknown> }> };
        };
        if (!epData.clusters) epData.clusters = { servers: {} };
        if (!epData.clusters.servers) epData.clusters.servers = {};
        if (!epData.clusters.servers[path.cluster]) {
            epData.clusters.servers[path.cluster] = { attributes: {} };
        }
        const attrs = epData.clusters.servers[path.cluster].attributes!;
        if (!(path.attribute in attrs)) {
            attrs[path.attribute] = null;
        }
    }
}
