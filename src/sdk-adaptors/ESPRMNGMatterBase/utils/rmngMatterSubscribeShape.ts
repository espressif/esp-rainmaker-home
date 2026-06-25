/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMNGBase, type ESPRMNGNode } from "@espressif/rmng-base-sdk";
import type { ESPCDFNode } from "@store";
import {
  isRmngHybridMatterCapability,
  isRmngPureMatterCapability,
  type RmngNodeCapabilityContext,
} from "@espressif/rmng-matter-sdk";
import {
  isClassicRmngCloudNode,
  isRmngMatterHybridNode,
  isRmngPureMatterNode,
} from "./rmngMatterNodeKind";

export interface RmngSubscribeNodeShape {
  id: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Minimal node shape for {@link ESPRMNGBase.subscriptionManager} — includes
 * Matter metadata so {@link MatterSubscriptionChannel.supportsNode} matches.
 */
export function cdfNodeToRmngSubscribeShape(
  node: ESPCDFNode,
): RmngSubscribeNodeShape {
  const raw = node._raw as
    | {
        metadata?: Record<string, unknown>;
        matterNodeId?: string;
        nodeType?: string;
      }
    | undefined;

  const meta = {
    ...(node.metadata as Record<string, unknown> | undefined),
    ...(raw?.metadata ?? {}),
  } as Record<string, unknown>;

  const matterNodeId =
    (node as { matterNodeId?: string }).matterNodeId ??
    (meta.matter_node_id as string | undefined) ??
    (meta.matterNodeId as string | undefined) ??
    raw?.matterNodeId;

  if (matterNodeId) {
    meta.matter_node_id = matterNodeId;
    meta.matterNodeId = matterNodeId;
  }

  const nodeType =
    (node as { nodeType?: string }).nodeType ??
    node.type ??
    raw?.nodeType ??
    ((node as { isMatter?: boolean }).isMatter ? "rmng_matter" : undefined);

  return {
    id: node.id,
    type: nodeType ?? "standard",
    metadata: Object.keys(meta).length > 0 ? meta : undefined,
  };
}

/**
 * Tags a backing {@link ESPRMNGNode} so {@link ESPRMNGBase.subscriptionManager}
 * `attachToMQTT` / per-node retries pass {@link MatterSubscriptionChannel.supportsNode}.
 * The SDK node class has no native `type` / `metadata` fields — they are attached here.
 */
export function ensureRmngSdkNodeMatterSubscribeShape(
  sdkNode: ESPRMNGNode,
  nodeId: string,
  matterNodeId?: string,
  nodeType: "pure_matter" | "rmng_matter" = "pure_matter",
): void {
  const mid = (matterNodeId ?? nodeId).toLowerCase();
  const tagged = sdkNode as ESPRMNGNode & {
    type?: string;
    metadata?: Record<string, unknown>;
  };
  tagged.type = nodeType;
  tagged.metadata = {
    matter_node_id: mid,
    matterNodeId: mid,
  };
  sdkNode.setSubscriptionChannelOrder?.(
    nodeType === "rmng_matter" ? ["mqtt", "matter"] : ["matter"],
  );
}

/**
 * Strips Matter-only subscription/transport tagging incorrectly applied by
 * {@link ESPRMNGFabric.getNodesWithDetails} when the bundled Matter SDK treats
 * `hasRmng` as `hasMatter`. Classic RMNG nodes must use MQTT (+ LAN local ctrl).
 */
export function normalizeClassicRmngSdkNode(sdkNode: ESPRMNGNode): void {
  if (!isClassicRmngCloudNode(sdkNode)) {
    return;
  }

  const tagged = sdkNode as ESPRMNGNode & {
    type?: string;
    metadata?: Record<string, unknown>;
    subscriptionConfig?: { channelOrder?: string[] };
    isMatter?: boolean;
  };

  delete tagged.type;
  delete tagged.metadata;
  delete tagged.subscriptionConfig;
  if ("isMatter" in tagged) {
    tagged.isMatter = false;
  }

  sdkNode.setSubscriptionChannelOrder?.(["mqtt"]);
  sdkNode.setTransportOrder(ESPRMNGBase.getTransportOrder());
}

export function isRmngMatterSubscribeNode(
  shape: RmngSubscribeNodeShape,
): boolean {
  const nodeType = shape.type?.toLowerCase?.();
  if (
    nodeType === "pure_matter" ||
    nodeType === "rmng_matter" ||
    nodeType === "rainmaker_matter"
  ) {
    return true;
  }
  const meta = shape.metadata;
  return !!(meta?.matter_node_id ?? meta?.matterNodeId);
}

function readMatterNodeIdFromSdkConfig(
  sdkNode: ESPRMNGNode,
): string | undefined {
  const config = sdkNode.config as unknown as Record<string, unknown> | undefined;
  const inner = (config?.config ?? config) as Record<string, unknown> | undefined;
  const raw =
    inner?.matter_node_id ??
    inner?.matterNodeId ??
    config?.matter_node_id ??
    config?.matterNodeId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/**
 * Reconcile SDK subscription channel order with groups `node_details` and cloud
 * config shape. Fabric {@link ESPRMNGFabric.getNodesWithDetails} often tags nodes
 * as pure-Matter (`channelOrder: [matter]`) before the adaptor knows the kind.
 */
export function normalizeRmngMatterSdkNodeSubscribeShape(
  sdkNode: ESPRMNGNode,
  options?: {
    matterNodeId?: string;
    groupNodeCapability?: RmngNodeCapabilityContext;
  },
): void {
  const nodeId = sdkNode.nodeId ?? "";
  const cap = options?.groupNodeCapability;
  const matterNodeId =
    options?.matterNodeId ?? cap?.matterNodeId ?? readMatterNodeIdFromSdkConfig(sdkNode);

  if (cap && isRmngHybridMatterCapability(cap, nodeId)) {
    ensureRmngSdkNodeMatterSubscribeShape(
      sdkNode,
      nodeId,
      matterNodeId,
      "rmng_matter",
    );
    sdkNode.refreshMqttTransport?.();
    return;
  }
  if (isClassicRmngCloudNode(sdkNode)) {
    normalizeClassicRmngSdkNode(sdkNode);
    return;
  }
  if (isRmngMatterHybridNode(sdkNode)) {
    ensureRmngSdkNodeMatterSubscribeShape(
      sdkNode,
      nodeId,
      matterNodeId,
      "rmng_matter",
    );
    sdkNode.refreshMqttTransport?.();
    return;
  }
  if (
    (cap && isRmngPureMatterCapability(cap, nodeId)) ||
    isRmngPureMatterNode(sdkNode)
  ) {
    ensureRmngSdkNodeMatterSubscribeShape(
      sdkNode,
      nodeId,
      matterNodeId ?? nodeId,
      "pure_matter",
    );
  }
}
