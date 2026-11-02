/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { getMatterNodeId } from "@shared/utils/matterLocalStorage";

/**
 * SDK node shape enriched in place before CDF transform. Classic SDK nodes
 * carry `id`; Neo SDK nodes carry `nodeId` — both are read.
 */
export type MatterSdkNodeLike = {
  id?: string;
  nodeId?: string;
  matterNodeId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Makes a node's operational Matter node id survive the CDF transform, so
 * local discovery can target it. Prefers the id the SDK put on the node and
 * falls back to the one persisted at commissioning by `setMatterNodeId`.
 * Stamps both the direct field and `metadata.matter_node_id`, which is the
 * one the CDF node transforms carry through.
 * @param nodes - Raw SDK nodes from `getNodesWithDetails`, mutated in place.
 */
export async function injectLocalMatterNodeIds(
  nodes: MatterSdkNodeLike[],
): Promise<void> {
  await Promise.all(
    nodes.map(async (node) => {
      const nodeId = node?.id ?? node?.nodeId;
      if (!nodeId) return;
      const meta = node.metadata as
        | { matter_node_id?: string; matterNodeId?: string }
        | undefined;
      const inMetadata = meta?.matter_node_id ?? meta?.matterNodeId;
      if (typeof inMetadata === "string" && inMetadata.trim()) return;

      // An id the SDK already put on the node still has to be mirrored into
      // metadata: the CDF node transform carries metadata across and the direct
      // field not at all, so discovery would otherwise have nothing to match.
      const onNode = node.matterNodeId;
      const resolved =
        typeof onNode === "string" && onNode.trim()
          ? onNode.trim()
          : await getMatterNodeId(nodeId);
      if (!resolved) return;

      node.matterNodeId = resolved;
      const target = (node.metadata ??= {});
      target.matter_node_id = resolved;
    }),
  );
}
