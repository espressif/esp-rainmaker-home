/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNeoMatterNode,
  attachHybridMatterLocalControl,
  type HybridControllableNode,
} from "@espressif/rainmaker-neo-matter-sdk";
import type { ESPRMNeoNode } from "@espressif/rainmaker-neo-base-sdk";
import { getMatterMetadata } from "@shared/utils/matterLocalStorage";
import { setHybridSubscriptionChannelOrder } from "@sdk-adaptors/ESPRMNeoBase/utils/matter/setHybridSubscriptionChannelOrder";

/**
 * Gives every hybrid in the list its `matter_local` control leg.
 *
 * The endpoint topology a hybrid needs to map cloud params onto Matter
 * addresses is never stored in the cloud — `/config` 403s for a node that
 * publishes its own config — so it is read back from the local copy kept at
 * commissioning. A node commissioned on another phone has no local copy and
 * stays cloud-only, the same fallback that applies whenever the node is not
 * locally reachable.
 * @param nodes - Raw SDK nodes from `getNodesWithDetails`, mutated in place.
 */
export async function attachHybridLocalControlToNodes(
  nodes: (ESPRMNeoNode | ESPRMNeoMatterNode)[],
): Promise<void> {
  await Promise.all(
    nodes.map(async (node) => {
      // Pure Matter nodes wire their own transport in the SDK constructor.
      if (node instanceof ESPRMNeoMatterNode) {
        return;
      }
      const hybrid = node as HybridControllableNode;
      setHybridSubscriptionChannelOrder(hybrid);
      // Only a hybrid without its param index yet can take the local leg, so
      // plain RMNeo nodes never pay the storage read.
      if (!hybrid.nodeId || !hybrid.matterNodeId || hybrid.matterParamIndex) {
        return;
      }
      const metadata = await getMatterMetadata(hybrid.nodeId);
      if (metadata) {
        attachHybridMatterLocalControl(hybrid, metadata);
      }
    }),
  );
}
