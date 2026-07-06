/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGGroup, ESPRMNGUser } from "@espressif/rmng-base-sdk";
import type { ESPCDFNode } from "@store";
import { ESPCDF } from "@store";
import { transformToESPCDFNode } from "@sdk-adaptors/ESPRMNGMatterBase/transformers/transformToESPCDFNode";
import { collectRmngNodesForGroup } from "../collectRmngGroupNodes";
import { resolveRmngNodeTransformOptions } from "./loadPureMatterBuildContext";
import {
  correctRmngOnlyNodeCapability,
  isPureMatterGroupNode,
  resolveGroupNodeCapabilityFromSubtree,
} from "../utils/rmngGroupNodeDetailsContext";
import {
  finalizeBridgedChildrenAfterGetNodes,
  mergeBridgedChildCdfAfterGetNodes,
} from "../bridge/rmngMatterBridgeGetNodes";
import { enrichRmngSdkGroupWithFabric } from "../utils/normalizeMatterFabricDetails";
import { isMatterNodeLocallyReachable } from "@shared/utils/matterLocalReachability";

/**
 * Matter-aware group node build: uses {@link collectRmngNodesForGroup} and
 * per-node transform options from group `node_details`, then loads commissioned
 * pure-Matter topology from local AsyncStorage (`matter_data`) via
 * {@link resolveRmngNodeTransformOptions} — same path as pre-migration
 * `buildCdfNodesFromGroup` in base group transform.
 */
export async function buildMatterCdfNodesFromGroup(
  group: ESPRMNGGroup,
  _user: ESPRMNGUser,
  _identifier: string,
): Promise<ESPCDFNode[]> {
  const sdkGroup = enrichRmngSdkGroupWithFabric(group);
  const nodes = await collectRmngNodesForGroup(sdkGroup);
  const nodeStore = ESPCDF.instance?.nodeStore;
  const baseOptions = { groupId: sdkGroup.groupId };
  const cdfNodes: ESPCDFNode[] = [];

  for (const node of nodes) {
    try {
      const capability = correctRmngOnlyNodeCapability(
        resolveGroupNodeCapabilityFromSubtree(sdkGroup, node.nodeId),
        sdkGroup.nodeDetails?.[node.nodeId],
      );
      const options = await resolveRmngNodeTransformOptions(node, {
        ...baseOptions,
        groupNodeCapability: capability,
        isPureMatterFromGroup: isPureMatterGroupNode(capability, node.nodeId),
        isMatterLocallyReachable: isMatterNodeLocallyReachable(node.nodeId),
      });
      let cdfNode = transformToESPCDFNode(node, options);
      const storeNode = nodeStore?.getNodeById?.(node.nodeId);
      cdfNode = mergeBridgedChildCdfAfterGetNodes(cdfNode, storeNode);
      cdfNodes.push(cdfNode);
    } catch (error) {
      console.warn("[buildMatterCdfNodesFromGroup] node transform failed", {
        nodeId: node.nodeId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  finalizeBridgedChildrenAfterGetNodes(cdfNodes);
  return cdfNodes;
}
