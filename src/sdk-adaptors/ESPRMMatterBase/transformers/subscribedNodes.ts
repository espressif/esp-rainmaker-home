/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Puts the store's current copy of a node into the list of subscribed nodes,
 * in place of any older copy with the same id.
 *
 * A node the cloud removed and re-added keeps its id but gets a new copy, with
 * a new Matter node id; the old copy left in the list would send reads to the
 * old id.
 * @param subscribedNodes - Nodes the adaptor subscribed, as captured so far.
 * @param currentNode - The node as the store holds it now.
 * @returns The list with `currentNode` in place of any older copy.
 */
export function withCurrentNode<NodeWithId extends { id: string }>(
  subscribedNodes: NodeWithId[],
  currentNode: NodeWithId
): NodeWithId[] {
  return [
    ...subscribedNodes.filter((node) => node.id !== currentNode.id),
    currentNode,
  ];
}
