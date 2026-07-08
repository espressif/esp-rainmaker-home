/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import { NodeMQTTOrchestrator } from "@espressif/rmng-base-sdk";
import { getClusterRegistryEntry } from "@espressif/rmng-matter-sdk";
import type { ClusterParamDefinition } from "@espressif/rmng-matter-sdk";
import { ESPMatterControlAdapter } from "@native-adaptors/implementations/ESPMatterControlAdapter";
import { isMatterNodeLocallyReachable } from "@shared/utils/matterLocalReachability";
import { LIGHT_PARAM_TO_MATTER_PATH } from "./rmngMatterTopologyHelpers";

type MatterPath = {
    endpoint: string;
    role: string;
    cluster: string;
    type: string;
    attr: string;
};

export interface HybridMatterParamWriteContext {
    node: ESPRMNGNode;
    nodeId: string;
    matterNodeId?: string;
}

function parseHexId(hex: string): number {
    return parseInt(hex.replace(/^0x/i, ""), 16);
}

function toHexKey(id: number): string {
    return `0x${id.toString(16)}`;
}

function registryParamName(paramName: string): string {
    return paramName === "ColorTemperature" ? "CCT" : paramName;
}

function resolveClusterParamDef(
    clusterId: number,
    paramName: string,
): ClusterParamDefinition | undefined {
    const entry = getClusterRegistryEntry(clusterId);
    return entry?.params.find(
        (p) => p.name === registryParamName(paramName) || p.name === paramName,
    );
}

function encodeParamWriteValue(
    paramDef: ClusterParamDefinition | undefined,
    paramName: string,
    value: unknown,
): unknown {
    if (paramDef?.resolver?.encodeValue) {
        return paramDef.resolver.encodeValue(value as string, undefined);
    }
    if (paramName === "Brightness" && typeof value === "number") {
        return Math.max(0, Math.min(254, Math.round((value / 100) * 254)));
    }
    return value;
}

type MatterCommandTlvEncoder = {
    encodeCommandFieldsToTlvHex(
        commandFields: Record<string, unknown> | null,
    ): Promise<string>;
};

/**
 * RMNG MQTT command values are hex-encoded CHIP TLV strings (`"0x...."`).
 * Fieldless commands (On/Off) encode to an empty Structure TLV (`0x1518`);
 * parameterized commands encode Structure + contextTag fields from resolvers.
 *
 * TLV encoding is owned by the native Matter adapter — matching the RainMaker
 * source of truth, the SDK no longer ships a JS TLV encoder.
 */
async function remoteMatterCommandWireValue(
    invokePayload: Record<string, unknown> | undefined,
): Promise<string> {
    const nativeEncoder = ESPMatterControlAdapter as Partial<MatterCommandTlvEncoder>;
    if (typeof nativeEncoder.encodeCommandFieldsToTlvHex !== "function") {
        throw new Error(
            "[hybridMatterParamWrite] native Matter TLV encoder unavailable; cannot encode remote command",
        );
    }
    const result = nativeEncoder.encodeCommandFieldsToTlvHex(invokePayload ?? null);
    return result instanceof Promise ? result : Promise.resolve(result);
}

/**
 * RMNG+Matter MQTT params use compressed endpoint topology:
 * `endpoint.c.s.<cluster>.c.<commandId>` for Matter **commands** (device acts),
 * `endpoint.c.s.<cluster>.a.<attributeId>` for shadow/index attributes only.
 *
 * Command values are always `"0x<tlv-hex>"` strings (never JSON Structure objects).
 */
async function buildRemoteMatterParamsForWrite(
    paramName: string,
    value: unknown,
    matterPath: MatterPath,
): Promise<Record<string, unknown>> {
    const clusterId = parseHexId(matterPath.cluster);
    const paramDef = resolveClusterParamDef(clusterId, paramName);
    const writeValue = encodeParamWriteValue(paramDef, paramName, value);
    const endpointHex = matterPath.endpoint;
    const clusterHex = matterPath.cluster;

    const invokePayload =
        writeValue !== null &&
        typeof writeValue === "object" &&
        !Array.isArray(writeValue)
            ? (writeValue as Record<string, unknown>)
            : undefined;
    const shouldInvoke =
        paramDef?.writeAsCommand || paramDef?.matterCommandId !== undefined;

    if (shouldInvoke) {
        const commandId =
            paramDef?.matterCommandId ??
            (typeof writeValue === "number" ? writeValue : undefined);
        if (commandId === undefined) {
            throw new Error(
                `[hybridMatterParamWrite] remote command id missing for ${paramName}`,
            );
        }
        const commandWireValue = await remoteMatterCommandWireValue(invokePayload);
        return {
            [endpointHex]: {
                c: {
                    s: {
                        [clusterHex]: {
                            c: {
                                [toHexKey(commandId)]: commandWireValue,
                            },
                        },
                    },
                },
            },
        };
    }

    const path = LIGHT_PARAM_TO_MATTER_PATH[paramName];
    const attribute = path?.attribute ?? matterPath.attr;
    return {
        [endpointHex]: {
            c: {
                s: {
                    [clusterHex]: {
                        a: {
                            [attribute]: writeValue,
                        },
                    },
                },
            },
        },
    };
}

function isMatterLocallyReachable(nodeId: string): boolean {
    return isMatterNodeLocallyReachable(nodeId);
}

async function publishRemoteMatterParams(
    node: ESPRMNGNode,
    nodeId: string,
    params: Record<string, unknown>,
): Promise<void> {
    node.refreshMqttTransport?.();
    try {
        await NodeMQTTOrchestrator.setParams(nodeId, params);
        return;
    } catch (directError) {
        console.warn(
            "[hybridMatterParamWrite] NodeMQTTOrchestrator.setParams failed, falling back to node.setParams",
            { nodeId, error: directError },
        );
    }
    await node.setParams(params);
}

/**
 * Local Matter write using the same cluster-registry invoke path as pure Matter
 * (`ESPRMMatterDeviceParam.setValue` / `matterClusterConfig`).
 */
async function writeLocalMatterParamViaClusterRegistry(
    matterNodeId: string,
    endpoint: number,
    clusterId: number,
    paramName: string,
    value: unknown,
): Promise<{ success: boolean; error?: string }> {
    const paramDef = resolveClusterParamDef(clusterId, paramName);
    if (!paramDef) {
        return { success: false, error: `No cluster registry entry for ${paramName}` };
    }

    const writeValue = encodeParamWriteValue(paramDef, paramName, value);
    const invokePayload =
        writeValue !== null &&
        typeof writeValue === "object" &&
        !Array.isArray(writeValue)
            ? (writeValue as Record<string, unknown>)
            : undefined;
    const shouldInvoke =
        paramDef.writeAsCommand || paramDef.matterCommandId !== undefined;

    if (shouldInvoke) {
        const commandId =
            paramDef.matterCommandId ??
            (typeof writeValue === "number" ? writeValue : undefined);
        if (commandId === undefined) {
            return {
                success: false,
                error: `Matter invoke requires command id for ${paramName}`,
            };
        }
        return ESPMatterControlAdapter.invoke(
            matterNodeId,
            endpoint,
            clusterId,
            commandId,
            invokePayload,
        );
    }

    const attributeId = paramDef.valueAttribute;
    if (attributeId === undefined) {
        return { success: false, error: `No attribute id for ${paramName}` };
    }
    return ESPMatterControlAdapter.write(
        matterNodeId,
        endpoint,
        clusterId,
        attributeId,
        writeValue,
    );
}

/**
 * Writes one hybrid RMNG+Matter param: Matter LAN first when `matter_local` is
 * registered, otherwise RMNG MQTT with compressed endpoint command params.
 */
export async function writeHybridMatterParam(
    ctx: HybridMatterParamWriteContext & {
        paramName: string;
        value: unknown;
        matterPath: MatterPath;
    },
): Promise<void> {
    const { node, nodeId, matterNodeId, paramName, value, matterPath } = ctx;
    const endpoint = parseHexId(matterPath.endpoint);
    const clusterId = parseHexId(matterPath.cluster);

    if (matterNodeId && isMatterLocallyReachable(nodeId)) {
        const result = await writeLocalMatterParamViaClusterRegistry(
            matterNodeId,
            endpoint,
            clusterId,
            paramName,
            value,
        );
        if (result.success) {
            return;
        }
        console.warn(
            "[hybridMatterParamWrite] local Matter invoke failed, falling back to MQTT",
            { nodeId, paramName, error: result.error },
        );
    }

    const remoteParams = await buildRemoteMatterParamsForWrite(paramName, value, matterPath);
    await publishRemoteMatterParams(node, nodeId, remoteParams);
}
