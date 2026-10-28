/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { getMatterNodeIdForRmNodeId } from "@native-adaptors/implementations/ESPMatterSubscriptionAdapter";

/** SDK node shape this file reads and fills in place. */
type SdkNodeWithMatterId = {
  id?: string;
  matterNodeId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Gives a node fetched on its own the Matter node id the app already holds
 * for it. `getNodeDetails` returns a node without the id, and the store swaps
 * it in for the copy that had it, so every on/off then fails with "The node
 * has no Matter node id yet". The id comes from the same map the node's
 * Matter link is subscribed with, in the cloud's upper-case form.
 * @param node - SDK node from `getNodeDetails`, filled in place.
 */
export function restoreMatterNodeId(node: SdkNodeWithMatterId): void {
  if (!node?.id || node.matterNodeId) return;
  const known = getMatterNodeIdForRmNodeId(node.id);
  if (!known) return;
  const matterNodeId = known.toUpperCase();
  node.matterNodeId = matterNodeId;
  const metadata = (node.metadata ??= {});
  if (!metadata.matter_node_id) {
    metadata.matter_node_id = matterNodeId;
  }
}
