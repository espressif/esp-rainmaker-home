/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGMatterMetadataInterface } from "@espressif/rmng-matter-sdk";
import type { ESPRMNGMatterMetadataShape } from "@espressif/rmng-matter-sdk";
import { isRmngHybridMatterCapability } from "@espressif/rmng-matter-sdk";
import {
    getMatterMetadata,
    getMatterNodeId,
    resolveOperationalMatterNodeId,
    setMatterNodeId,
} from "@shared/utils/matterLocalStorage";
import { matterDataToEspMetadata } from "../utils/matterDataToMetadata";
import type { TransformRmngNodeOptions } from "./buildRmngMatterCdfNode";
import {
    isClassicRmngCloudNode,
    isRmngPureMatterNode,
    isRmngMatterHybridNode,
} from "../utils/rmngMatterNodeKind";
import { loadRmngHybridMatterBuildContext } from "./loadRmngHybridMatterBuildContext";
import { logRmngNodeConfigRaw } from "@sdk-adaptors/ESPRMNGBase/utils/rmngAdaptorDebugLog";
import {
    hasUsableMatterTopology,
    isPureMatterGroupNode,
} from "../utils/rmngGroupNodeDetailsContext";
import { isBridgedRmngMatterChildNode } from "../bridge/rmngMatterBridgeKind";
// import { logRawMatterData } from "../utils/logRawMatterData";
import { extractParamValuesFromMatterData } from "../utils/rmngMatterTopologyHelpers";
import { ensureRmngSdkNodeMatterSubscribeShape } from "../utils/rmngMatterSubscribeShape";

export interface PureMatterBuildContext {
    matterNodeId?: string;
    matterMetadata?: ESPRMNGMatterMetadataInterface;
    localMatterMetadata?: Record<string, unknown>;
    storedParams?: Record<string, unknown>;
    isPureMatter: true;
}

/**
 * Loads commissioned Matter id + metadata from AsyncStorage for pure-Matter nodes.
 */
export async function loadPureMatterBuildContext(
    nodeId: string,
    fromApi?: { matterNodeId?: string; matterMetadata?: Record<string, unknown> },
): Promise<PureMatterBuildContext> {
    const storedId = await getMatterNodeId(nodeId);
    const matterNodeId = resolveOperationalMatterNodeId(nodeId, {
        fromGroupApi: fromApi?.matterNodeId ?? null,
        storedId,
    });

    if (fromApi?.matterNodeId && matterNodeId && !storedId) {
        void setMatterNodeId(nodeId, matterNodeId);
    }

    const localMeta = (await getMatterMetadata(nodeId)) ?? {};
    logRmngNodeConfigRaw("local.AsyncStorage.matter_metadata", nodeId, localMeta, {
        source: "local",
        fromApi,
    });
    const mergedLocal = {
        ...localMeta,
        ...(fromApi?.matterMetadata ?? {}),
    };

    const matterData = mergedLocal.matter_data as Record<string, unknown> | undefined;
    // logRawMatterData(nodeId, "loadPureMatterBuildContext cold start", matterData);
    const fromMatterData = matterDataToEspMetadata(matterData, {
        deviceName:
            (mergedLocal.deviceName as string | undefined) ??
            (matterData?.info as { name?: string } | undefined)?.name,
        deviceType:
            (mergedLocal.deviceType as number | undefined) ??
            (matterData?.info as { type?: number } | undefined)?.type,
    });

    const apiMatter = fromApi?.matterMetadata?.Matter ?? fromApi?.matterMetadata?.matter;
    const matterMetadata =
        fromMatterData ??
        (apiMatter as ESPRMNGMatterMetadataInterface | undefined) ??
        matterDataToEspMetadata(undefined, {
            deviceName: mergedLocal.deviceName as string | undefined,
            deviceType: mergedLocal.deviceType as number | undefined,
        });

    return {
        matterNodeId: matterNodeId || undefined,
        matterMetadata,
        localMatterMetadata: mergedLocal,
        storedParams: extractParamValuesFromMatterData(matterData),
        isPureMatter: true,
    };
}

export async function resolveRmngNodeTransformOptions(
    node: import("@espressif/rmng-base-sdk").ESPRMNGNode,
    base?: TransformRmngNodeOptions,
): Promise<TransformRmngNodeOptions> {
    const groupCapability = base?.groupNodeCapability;
    const hybridFromGroup =
        groupCapability &&
        isRmngHybridMatterCapability(groupCapability, node.nodeId);

    // Bridged mesh children: rmng-only in node_details, Matter topology from SDK config/MQTT.
    if (isBridgedRmngMatterChildNode(node)) {
        const ctx = await loadRmngHybridMatterBuildContext(node, base);
        return {
            ...base,
            ...ctx,
            isRmngMatterHybrid: true,
            isBridgedRmngMatterChild: true,
            matterNodeIdOverride: ctx.matterNodeId,
            matterMetadata: ctx.matterMetadata as ESPRMNGMatterMetadataShape | undefined,
        };
    }

    // Cloud config is authoritative for classic RMNG nodes (data_model default + devices).
    if (isClassicRmngCloudNode(node)) {
        return { ...base, isPureMatter: false };
    }

    // Groups `node_details` is the source of truth: rmng-only nodes are not Matter.
    if (groupCapability && !groupCapability.hasMatter) {
        return { ...base, isPureMatter: false };
    }

    if (hybridFromGroup || (!groupCapability && isRmngMatterHybridNode(node))) {
        const ctx = await loadRmngHybridMatterBuildContext(node, base);
        if (ctx.matterNodeId) {
            ensureRmngSdkNodeMatterSubscribeShape(
                node,
                node.nodeId,
                ctx.matterNodeId,
                "rmng_matter",
            );
        }
        return {
            ...base,
            ...ctx,
            isRmngMatterHybrid: true,
            matterNodeIdOverride: ctx.matterNodeId,
            matterMetadata: ctx.matterMetadata as ESPRMNGMatterMetadataShape | undefined,
        };
    }

    const pureFromGroup =
        base?.isPureMatterFromGroup ??
        (groupCapability
            ? isPureMatterGroupNode(groupCapability, node.nodeId)
            : false);

    if (!isRmngPureMatterNode(node) && !pureFromGroup) {
        return { ...base, isPureMatter: false };
    }

    const config = node.config as unknown as Record<string, unknown> | undefined;
    logRmngNodeConfigRaw("pure.cloud.node.config", node.nodeId, config, {
        source: "cloud",
        params: (node as { params?: unknown }).params,
        groupCapability,
    });

    const inner = (config?.config ?? config) as Record<string, unknown> | undefined;
    const fromApiMatterNodeId =
        groupCapability?.matterNodeId ??
        (inner?.matter_node_id as string | undefined) ??
        (inner?.matterNodeId as string | undefined) ??
        (config?.matter_node_id as string | undefined);

    const ctx = await loadPureMatterBuildContext(node.nodeId, {
        matterNodeId: fromApiMatterNodeId,
        matterMetadata: (inner?.Matter ?? inner?.matter ?? config?.Matter) as
            | Record<string, unknown>
            | undefined,
    });

    const localHasTopology = hasUsableMatterTopology(ctx.localMatterMetadata);

    return {
        ...base,
        ...ctx,
        isPureMatter: true,
        isPureMatterFromGroup: pureFromGroup,
        matterNodeIdOverride: ctx.matterNodeId,
        matterMetadata: ctx.matterMetadata as ESPRMNGMatterMetadataShape | undefined,
        hasUsableMatterTopology:
            base?.hasUsableMatterTopology ?? localHasTopology,
    };
}
