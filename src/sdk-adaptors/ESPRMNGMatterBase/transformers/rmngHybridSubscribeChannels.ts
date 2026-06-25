/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPRMNGBase,
    ESPRMNGNode,
    ESPRMNG_NODE_EVENT_PARAMS,
    type ESPNodeUpdateData,
} from "@espressif/rmng-base-sdk";
import type { ESPCDFNode } from "@store";
import {
    cdfNodeToRmngSubscribeShape,
    ensureRmngSdkNodeMatterSubscribeShape,
    isRmngMatterSubscribeNode,
    normalizeRmngMatterSdkNodeSubscribeShape,
} from "../utils/rmngMatterSubscribeShape";
import { resolveGroupNodeCapabilityFromStore } from "../utils/rmngGroupNodeDetailsContext";

const MQTT_CHANNEL = "mqtt";
const MATTER_CHANNEL = "matter";

const hybridMqttAttachedNodes = new WeakSet<ESPRMNGNode>();

function readMatterNodeId(cdfNode: ESPCDFNode): string | undefined {
    const direct = (cdfNode as { matterNodeId?: string }).matterNodeId;
    if (typeof direct === "string" && direct.trim()) {
        return direct.trim();
    }
    const meta = cdfNode.metadata as
        | { matter_node_id?: string; matterNodeId?: string }
        | undefined;
    return meta?.matter_node_id ?? meta?.matterNodeId;
}

/** Allows re-attaching SDK MQTT after `_raw` swap or shadow name change. */
export function resetHybridSdkMqttAttachment(sdkNode: ESPRMNGNode): void {
    hybridMqttAttachedNodes.delete(sdkNode);
}

function buildHybridMqttSubscribeTarget(
    cdfNode: ESPCDFNode,
    nodeId: string,
): ESPRMNGNode | { id: string; subscriptionConfig: { channelOrder: string[] } } {
    const sdkNode = cdfNode._raw as ESPRMNGNode | undefined;
    if (sdkNode?.nodeId) {
        normalizeRmngMatterSdkNodeSubscribeShape(sdkNode, {
            matterNodeId: readMatterNodeId(cdfNode),
            groupNodeCapability: resolveGroupNodeCapabilityFromStore(nodeId),
        });
        (sdkNode as ESPRMNGNode & {
            subscriptionConfig?: { channelOrder: string[] };
        }).subscriptionConfig = { channelOrder: [MQTT_CHANNEL] };
        return sdkNode;
    }
    return { id: nodeId, subscriptionConfig: { channelOrder: [MQTT_CHANNEL] } };
}

/**
 * Hybrid nodes need **both** MQTT (cloud shadow) and Matter (LAN subscription).
 * `subscribeToNode` stops at the first successful channel, so we subscribe each
 * channel explicitly with a pinned order.
 */
export async function subscribeHybridNodeChannels(
    nodeId: string,
    cdfNode: ESPCDFNode,
    callback: (update: ESPNodeUpdateData) => void,
): Promise<void> {
    const mgr = ESPRMNGBase.subscriptionManager;

    await mgr.subscribeToNode(buildHybridMqttSubscribeTarget(cdfNode, nodeId), callback);

    const matterShape = cdfNodeToRmngSubscribeShape(cdfNode);
    if (!isRmngMatterSubscribeNode(matterShape)) {
        return;
    }

    const sdkNode = cdfNode._raw as ESPRMNGNode | undefined;
    const matterTarget = sdkNode?.nodeId
        ? (() => {
              (sdkNode as ESPRMNGNode & {
                  subscriptionConfig?: { channelOrder: string[] };
              }).subscriptionConfig = { channelOrder: [MATTER_CHANNEL] };
              return sdkNode;
          })()
        : {
              ...matterShape,
              subscriptionConfig: { channelOrder: [MATTER_CHANNEL] },
          };

    try {
        await mgr.subscribeToNode(matterTarget, callback);
    } catch (error) {
        console.warn(
            "[rmngHybridSubscribeChannels] matter channel subscribe failed",
            nodeId,
            error,
        );
    }
}

/**
 * Re-attaches MQTT shadow delivery onto the backing SDK node after constructor-time
 * attach failed (node was untagged). Emits `params` for `buildRmngHybridMatterCdfNode`.
 */
export async function attachHybridSdkMqttSubscription(
    sdkNode: ESPRMNGNode,
    matterNodeId?: string,
): Promise<void> {
    const nodeId = sdkNode.nodeId;
    if (!nodeId) return;
    if (hybridMqttAttachedNodes.has(sdkNode)) return;

    ensureRmngSdkNodeMatterSubscribeShape(sdkNode, nodeId, matterNodeId, "rmng_matter");
    (sdkNode as ESPRMNGNode & {
        subscriptionConfig?: { channelOrder: string[] };
    }).subscriptionConfig = { channelOrder: [MQTT_CHANNEL] };

    try {
        await ESPRMNGBase.subscriptionManager.subscribeToNode(
            sdkNode,
            (update: ESPNodeUpdateData) => {
                const raw =
                    (update.metadata?.shadow as unknown) ??
                    ({
                        state: {
                            reported: {
                                params: update.payload,
                                ...(update.metadata as { online?: boolean } | undefined),
                            },
                        },
                    } as unknown);
                sdkNode.emit(ESPRMNG_NODE_EVENT_PARAMS, raw);
            },
        );
        hybridMqttAttachedNodes.add(sdkNode);
    } catch (error) {
        console.warn(
            "[rmngHybridSubscribeChannels] SDK MQTT re-attach failed",
            nodeId,
            error,
        );
    }
}
