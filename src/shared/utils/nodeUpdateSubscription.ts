/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode, ESPCDFUser } from "@store";
import { onSessionEnd } from "@shared/utils/userSession";

/** Ids of the nodes the last subscribe of this session covered. */
let subscribedNodeIds = new Set<string>();

// A new session starts with nothing subscribed.
onSessionEnd(() => {
  subscribedNodeIds = new Set();
});

/**
 * Subscribes nodes to live updates (cloud pushes, Matter reports). Pass every
 * node in the store: the adaptor replaces its subscribed list with this one.
 * @param user - Signed-in CDF user.
 * @param nodeList - All nodes in the store.
 */
export async function subscribeNodesToUpdates(
  user: ESPCDFUser,
  nodeList: ESPCDFNode[],
): Promise<void> {
  // Adaptors skip nodes without SDK data; they count as new once it lands.
  subscribedNodeIds = new Set(
    nodeList.filter((node) => node._raw).map((node) => node.id),
  );
  try {
    await user.subscribeToNodeUpdates?.({ nodeList });
  } catch (error) {
    // Forget the list so the next call tries again.
    subscribedNodeIds = new Set();
    throw error;
  }
}

/**
 * Subscribes again only when the store holds a node the last subscribe did
 * not cover, e.g. the nodes of a home opened for the first time.
 * @param user - Signed-in CDF user.
 * @param nodeList - All nodes in the store.
 */
export async function subscribeNewNodesToUpdates(
  user: ESPCDFUser,
  nodeList: ESPCDFNode[],
): Promise<void> {
  if (nodeList.every((node) => !node._raw || subscribedNodeIds.has(node.id))) {
    return;
  }
  await subscribeNodesToUpdates(user, nodeList);
}
