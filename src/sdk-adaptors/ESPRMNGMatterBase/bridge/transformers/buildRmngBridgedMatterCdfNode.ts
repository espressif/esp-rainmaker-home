/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import type { ESPCDFNode } from "@store";
import { ESPCDF } from "@store";
import { buildRmngHybridMatterCdfNode } from "../../transformers/buildRmngHybridMatterCdfNode";
import type { TransformRmngNodeOptions } from "../../transformers/buildRmngMatterCdfNode";
import {
    parseBridgeParentNodeId,
    resolveBridgedChildMatterControl,
    seedBridgedOwnedEndpointIds,
} from "../rmngMatterBridgeKind";
import {
    deriveMatterNodeIdFromThingName,
    resolveOperationalMatterNodeId,
} from "@shared/utils/matterLocalStorage";

const BRIDGE_LOG = "[rmngBridge]";

function resolveParentMatterNodeId(
    childNodeId: string,
    options?: TransformRmngNodeOptions,
): string | undefined {
    const parentNodeId = parseBridgeParentNodeId(childNodeId);
    if (!parentNodeId) return undefined;

    const store = ESPCDF.instance?.nodeStore;
    const fromStore = resolveBridgedChildMatterControl(childNodeId, (id) =>
        store?.getNodeById?.(id),
    );
    if (fromStore?.parentMatterNodeId) {
        return fromStore.parentMatterNodeId;
    }

    return (
        resolveOperationalMatterNodeId(parentNodeId, {
            fromGroupApi: options?.groupNodeCapability?.matterNodeId ?? null,
        }) || deriveMatterNodeIdFromThingName(parentNodeId)
    );
}

/**
 * Bridged RMNG+Matter child: hybrid CDF with local control routed via parent's Matter id.
 */
export function buildRmngBridgedMatterCdfNode(
    node: ESPRMNGNode,
    options?: TransformRmngNodeOptions,
): ESPCDFNode {
    const parentNodeId = parseBridgeParentNodeId(node.nodeId);
    const parentMatterNodeId = resolveParentMatterNodeId(node.nodeId, options);

    const cdfNode = buildRmngHybridMatterCdfNode(node, {
        ...options,
        isRmngMatterHybrid: true,
        isBridgedRmngMatterChild: true,
        matterNodeIdOverride: parentMatterNodeId,
        subscriptionChannelOrder: ["mqtt"],
    });

    const meta = cdfNode.metadata as Record<string, unknown>;
    meta.isBridgedRmngMatterChild = true;
    meta.bridgeParentNodeId = parentNodeId;
    seedBridgedOwnedEndpointIds(meta, cdfNode);
    meta.matter_node_id = parentMatterNodeId;
    meta.matterNodeId = parentMatterNodeId;
    (cdfNode as { matterNodeId?: string }).matterNodeId = parentMatterNodeId;

    console.log(`${BRIDGE_LOG} buildRmngBridgedMatterCdfNode`, {
        nodeId: node.nodeId,
        parentNodeId,
        parentMatterNodeId,
        deviceCount: cdfNode.devices?.length ?? 0,
        ownedEndpoints: (meta as { bridgedOwnedEndpointIds?: string[] })
            .bridgedOwnedEndpointIds,
        endpointDeviceTypes: (meta as { bridgedEndpointDeviceTypes?: Record<string, number[]> })
            .bridgedEndpointDeviceTypes,
    });

    return cdfNode;
}
