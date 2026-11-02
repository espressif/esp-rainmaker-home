/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  injectLocalMatterNodeIds,
  type MatterSdkNodeLike,
} from "@sdk-adaptors/shared/utils/injectLocalMatterNodeIds";
import { setHybridSubscriptionChannelOrder } from "./setHybridSubscriptionChannelOrder";

/**
 * Re-arms the Matter legs of a node instance the caller just rebuilt.
 *
 * The whole rigging — LAN reachability, hybrid param index, `matter_local`
 * transport manager and order — lives on the *instance*, so the fresh one
 * `getNodeDetails` mints drops what commissioning attached and control falls
 * back to the cloud silently. `registerMatterNodes` restores it from what the
 * SDK registry remembers. Skipped, before the lazy import, for a node with no
 * Matter identity, so a plain RMNeo device stays out of this path.
 * @param node - Raw SDK node about to be transformed to CDF, mutated in place.
 */
export async function rearmMatterNodeInstance(
  node: MatterSdkNodeLike,
): Promise<void> {
  const nodeId = node?.id ?? node?.nodeId;
  if (!nodeId) {
    return;
  }
  try {
    // One storage read: the injector already falls back to the stored id and
    // mirrors it onto the node, so a node still without one is not Matter.
    await injectLocalMatterNodeIds([node]);
    const meta = node.metadata as { matter_node_id?: string } | undefined;
    if (!(node.matterNodeId ?? meta?.matter_node_id)) {
      return;
    }

    const { registerMatterNodes } =
      await import("@espressif/rainmaker-neo-matter-sdk");
    // Cast: callers hand us real SDK nodes, but the parameter is the app's
    // permissive structural type, which no SDK node class satisfies nominally.
    registerMatterNodes([node as never]);
    setHybridSubscriptionChannelOrder(node);
  } catch (error) {
    console.warn(
      `[rearmMatterNodeInstance] re-arm failed for ${nodeId}:`,
      error,
    );
  }
}
