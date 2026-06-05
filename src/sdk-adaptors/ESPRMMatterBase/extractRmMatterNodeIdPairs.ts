/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNode } from "@espressif/rainmaker-base-sdk";
import { ESPRMFabric, ESPRMMatterNode } from "@espressif/rainmaker-matter-sdk";

/** RainMaker node id paired with Matter operational node id. */
export interface RmMatterNodeIdPair {
  nodeId: string;
  matterNodeId: string;
}

/**
 * Loads `(rmNodeId, matterNodeId)` pairs from a fabric via `getNodesWithDetails`.
 *
 * Replaces removed `ESPRMFabric.getRMMatterNodeList`.
 * @param fabric - Matter fabric SDK instance
 * @returns Id pairs for mDNS / local discovery indexing
 */
export async function extractRmMatterNodeIdPairsFromFabric(
  fabric: ESPRMFabric,
): Promise<RmMatterNodeIdPair[]> {
  const nodes = await fabric.getNodesWithDetails();
  const pairs: RmMatterNodeIdPair[] = [];

  for (const node of nodes) {
    const pair = toRmMatterNodeIdPair(node);
    if (pair) {
      pairs.push(pair);
    }
  }

  return pairs;
}

/**
 * @param node - SDK node from `getNodesWithDetails`
 * @returns Pair when both ids are present
 */
function toRmMatterNodeIdPair(
  node: ESPRMNode | ESPRMMatterNode,
): RmMatterNodeIdPair | null {
  const nodeId = node.id ?? "";
  if (!nodeId) {
    return null;
  }

  const matterNodeId =
    (node as ESPRMMatterNode).matterNodeId ??
    (node as { matter_node_id?: string }).matter_node_id ??
    "";

  if (!matterNodeId) {
    return null;
  }

  return { nodeId, matterNodeId };
}
