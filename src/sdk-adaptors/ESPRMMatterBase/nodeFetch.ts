/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFGroup, ESPCDFNode } from "@store";
import type { ESPRMGroup, ESPRMUser } from "@espressif/rainmaker-matter-sdk";
import { ESPRMFabric } from "@espressif/rainmaker-matter-sdk";
import { transformToESPCDFNodes } from "@sdk-adaptors/ESPRMBase/transformers/transformToESPCDFNode";
import { getMatterNodeId } from "@shared/utils/matterLocalStorage";
import { subscribeMatterControllerTransport } from "./matterControllerTransportHandler";

/** SDK node shape enriched in place before the CDF transform. */
type MatterSdkNodeLike = {
  id?: string;
  matterNodeId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Re-attaches the operational Matter node id the cloud omitted for hybrid
 * RainMaker+Matter nodes (persisted at commissioning by `setMatterNodeId`), so
 * local discovery can target them. Stamps both the direct field and
 * `metadata.matter_node_id`, which `transformToESPCDFNode` copies by reference.
 * @param nodes - Raw SDK nodes from `getNodesWithDetails`, mutated in place.
 */
async function injectLocalMatterNodeIds(nodes: MatterSdkNodeLike[]): Promise<void> {
  await Promise.all(
    nodes.map(async (node) => {
      const nodeId = node?.id;
      if (!nodeId) return;
      const meta = node.metadata as
        | { matter_node_id?: string; matterNodeId?: string }
        | undefined;
      const existing =
        node.matterNodeId ?? meta?.matter_node_id ?? meta?.matterNodeId;
      if (typeof existing === "string" && existing.trim()) return;

      const stored = await getMatterNodeId(nodeId);
      if (!stored) return;

      node.matterNodeId = stored;
      const target = (node.metadata ??= {});
      target.matter_node_id = stored;
    }),
  );
}

/**
 * The one node-details fetch for a group on the Matter stack: one
 * `node_details` call through the group's raw SDK instance (wrapped as a
 * fabric for Matter homes), local Matter ids re-attached, controller transport
 * subscribed. Used by the login sync and by `group.getNodes()` on home switch.
 * @param group - CDF group whose `_raw` SDK instance provides node details
 * @param esprmUser - Matter SDK user for the controller transport
 * @returns Transformed CDF nodes for the group
 */
export async function fetchMatterGroupNodes(
  group: ESPCDFGroup,
  esprmUser: ESPRMUser,
): Promise<ESPCDFNode[]> {
  const raw = (group as { _raw?: ESPRMGroup | ESPRMFabric })._raw;
  if (!raw) return [];

  const nodes = group.isMatter
    ? await (raw instanceof ESPRMFabric
        ? raw
        : new ESPRMFabric(raw as ESPRMGroup)
      ).getNodesWithDetails()
    : await (raw as ESPRMGroup & {
      getNodesWithDetails?: () => Promise<unknown[]>;
    }).getNodesWithDetails?.() ?? [];

  // Re-attach locally-persisted matter_node_id the cloud omitted for hybrid nodes.
  if (group.isMatter) {
    await injectLocalMatterNodeIds(nodes as unknown as MatterSdkNodeLike[]);
  }

  const cdfNodes = transformToESPCDFNodes(nodes, "matterGroupSync.fetchMatterGroupNodes");

  subscribeMatterControllerTransport(esprmUser);

  return cdfNodes;
}
