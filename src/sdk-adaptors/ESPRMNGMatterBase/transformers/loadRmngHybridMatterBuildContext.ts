/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGMatterMetadataInterface } from "@espressif/rmng-matter-sdk";
import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import {
    getMatterMetadata,
    getMatterNodeId,
    resolveOperationalMatterNodeId,
} from "@shared/utils/matterLocalStorage";
import {
    isRmngMatterEndpointConfig,
    normalizeRmngMatterConfigToCompressed,
} from "../utils/rmngMatterEndpointFormat";
import { mergeRmngMatterConfigAndParams } from "../utils/mergeRmngMatterConfigAndParams";
import {
    resolveHybridEndpointParamsForBuild,
    unionHybridConfigEndpointsWithLocalSchema,
} from "../utils/rmngMatterHybridBuildParams";
import { matterDataToEspMetadata } from "../utils/matterDataToMetadata";
import { readInnerConfig } from "../utils/rmngMatterNodeKind";
import type { TransformRmngNodeOptions } from "./buildRmngMatterCdfNode";
import {
    logRmngDeviceParamsRaw,
    logRmngNodeConfigRaw,
} from "@sdk-adaptors/ESPRMNGBase/utils/rmngAdaptorDebugLog";
import { parseBridgeParentNodeId } from "../bridge/rmngMatterBridgeKind";
import {
    hasUsableMatterTopology,
    resolveGroupNodeCapabilityFromStore,
} from "../utils/rmngGroupNodeDetailsContext";

export interface RmngHybridMatterBuildContext {
    isRmngMatterHybrid: true;
    rmngMatterMergedData: Record<string, unknown>;
    matterNodeId?: string;
    matterMetadata?: ESPRMNGMatterMetadataInterface;
    localMatterMetadata?: Record<string, unknown>;
    storedParams?: Record<string, unknown>;
}

function readConfigRecord(node: ESPRMNGNode): Record<string, unknown> | undefined {
    return node.config as unknown as Record<string, unknown> | undefined;
}

/**
 * Loads hybrid RMNG+Matter build context: config+params merge and commissioned Matter id.
 */
export async function loadRmngHybridMatterBuildContext(
    node: ESPRMNGNode,
    base?: TransformRmngNodeOptions,
): Promise<RmngHybridMatterBuildContext> {
    const config = readConfigRecord(node);
    const inner = readInnerConfig(node);
    const configAny = {
        data_model:
            (config?.data_model as string | undefined) ??
            (inner?.data_model as string | undefined) ??
            "matter",
        info:
            (config?.info as Record<string, unknown> | undefined) ??
            (inner?.info as Record<string, unknown> | undefined),
        endpoints:
            (config?.endpoints as Record<string, unknown> | undefined) ??
            (inner?.endpoints as Record<string, unknown> | undefined),
    };

    const localMeta = (await getMatterMetadata(node.nodeId)) ?? {};

    const sdkParams = (node as { params?: unknown }).params;
    logRmngNodeConfigRaw("hybrid.cloud.sdk.config", node.nodeId, config, {
        source: "cloud-getNodes",
        innerConfigKeys: inner ? Object.keys(inner) : [],
        dataModel: configAny.data_model,
        endpointCount: configAny.endpoints
            ? Object.keys(configAny.endpoints).length
            : 0,
    });
    if (sdkParams != null) {
        logRmngDeviceParamsRaw(
            "hybrid.cloud.sdk.params",
            node.nodeId,
            "sdk-getParams",
            sdkParams,
        );
    }

    const endpointParams = resolveHybridEndpointParamsForBuild(node, base);
    const hasMqttEndpointParams = Object.keys(endpointParams).length > 0;

    let rmngMatterMergedData = base?.rmngMatterMergedData;
    if (!rmngMatterMergedData && isRmngMatterEndpointConfig(configAny)) {
        let normalized = normalizeRmngMatterConfigToCompressed(configAny);
        if (hasUsableMatterTopology(localMeta) && hasMqttEndpointParams) {
            const matterData = localMeta.matter_data as
                | { endpoints?: Record<string, unknown> }
                | undefined;
            normalized = unionHybridConfigEndpointsWithLocalSchema(
                normalized,
                matterData?.endpoints ?? {},
            );
        }
        rmngMatterMergedData = mergeRmngMatterConfigAndParams(
            normalized,
            endpointParams,
        );
    }

    if (!rmngMatterMergedData) {
        rmngMatterMergedData = {
            data_model: "matter",
            info: configAny.info ?? {},
            endpoints: {},
        };
    }

    logRmngNodeConfigRaw("local.AsyncStorage.matter_metadata", node.nodeId, localMeta, {
        source: "local",
    });

    if (hasUsableMatterTopology(localMeta) && !hasMqttEndpointParams) {
        // Commissioning fallback only — no MQTT params yet; local topology supplies schema+values.
        const matterData = localMeta.matter_data as
            | { endpoints?: Record<string, unknown> }
            | undefined;
        const localEndpoints = matterData?.endpoints ?? {};
        const cloudEndpoints =
            (rmngMatterMergedData.endpoints as Record<string, unknown> | undefined) ?? {};
        rmngMatterMergedData = mergeRmngMatterConfigAndParams(
            normalizeRmngMatterConfigToCompressed({
                data_model: "matter",
                info:
                    (rmngMatterMergedData.info as Record<string, unknown> | undefined) ??
                    configAny.info,
                endpoints: { ...cloudEndpoints, ...localEndpoints },
            }),
            localEndpoints,
        );
    }

    logRmngNodeConfigRaw(
        "hybrid.cloud.merged.config+params",
        node.nodeId,
        rmngMatterMergedData,
        {
            source: "cloud",
            storedParams: endpointParams,
            hasMqttEndpointParams,
        },
    );

    const fromApiMatterNodeId =
        base?.groupNodeCapability?.matterNodeId ??
        (inner?.matter_node_id as string | undefined) ??
        (inner?.matterNodeId as string | undefined) ??
        (config?.matter_node_id as string | undefined);

    const storedId = await getMatterNodeId(node.nodeId);
    let matterNodeId =
        resolveOperationalMatterNodeId(node.nodeId, {
            fromGroupApi: fromApiMatterNodeId ?? null,
            storedId,
        }) || undefined;

    const parentNodeId = parseBridgeParentNodeId(node.nodeId);
    if (parentNodeId) {
        const parentCapability = resolveGroupNodeCapabilityFromStore(
            parentNodeId,
            base?.groupId,
        );
        matterNodeId =
            resolveOperationalMatterNodeId(parentNodeId, {
                fromGroupApi: parentCapability?.matterNodeId ?? null,
                storedId: await getMatterNodeId(parentNodeId),
            }) || matterNodeId;
    }

    const matterMetadata =
        matterDataToEspMetadata(
            localMeta.matter_data as Record<string, unknown> | undefined,
            {
                deviceName: localMeta.deviceName as string | undefined,
                deviceType: localMeta.deviceType as number | undefined,
            },
        ) ??
        (inner?.Matter as ESPRMNGMatterMetadataInterface | undefined) ??
        (inner?.matter as ESPRMNGMatterMetadataInterface | undefined);

    return {
        isRmngMatterHybrid: true,
        rmngMatterMergedData,
        matterNodeId: matterNodeId || undefined,
        matterMetadata,
        localMatterMetadata: localMeta,
        storedParams: endpointParams,
    };
}
