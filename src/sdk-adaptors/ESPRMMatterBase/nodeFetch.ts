/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFGroup, ESPCDFNode } from "@store";
import type { ESPRMGroup, ESPRMUser } from "@espressif/rainmaker-matter-sdk";
import { ESPRMFabric } from "@espressif/rainmaker-matter-sdk";
import { transformToESPCDFNodes } from "@sdk-adaptors/ESPRMBase/transformers/transformToESPCDFNode";
import {
  injectLocalMatterNodeIds,
  type MatterSdkNodeLike,
} from "@sdk-adaptors/shared/utils/injectLocalMatterNodeIds";
import { subscribeMatterControllerTransport } from "./matterControllerTransportHandler";

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
