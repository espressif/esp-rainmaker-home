/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import {
  MATTER_METADATA_KEY,
  MATTER_METADATA_NODE_ID_KEY,
} from "@shared/utils/constants";

/** Matter markers a base-adaptor node rebuild does not repopulate. */
type MatterIdentityFields = {
  isMatter?: boolean;
  matterNodeId?: string;
  nodeType?: string;
  identifier?: string;
};

/**
 * Re-applies the Matter identity a node refresh drops.
 *
 * `getNodeDetails` builds a plain SDK node, so it never runs the Matter
 * decorator, and the cloud does not echo `matter_node_id` in a pure-Matter
 * node's config. The refreshed node therefore carries no Matter marker at all
 * and stops being recognised as a Matter node — local discovery drops it from
 * the CHIP target list and its card disappears. A node that had no Matter
 * identity to begin with can never gain one here; a hybrid keeps only its
 * operational id (see {@link preserveHybridMatterNodeId}).
 * @param refreshed - Newly transformed CDF node about to replace the stored one.
 * @param existing - Node currently in the store, or undefined on first insert.
 */
export function preserveMatterIdentityOnRefresh(
  refreshed: ESPCDFNode,
  existing: ESPCDFNode | undefined,
): void {
  const previous = existing as
    | (ESPCDFNode & MatterIdentityFields)
    | undefined;
  if (!previous) {
    return;
  }
  if (previous.isMatter !== true) {
    preserveHybridMatterNodeId(refreshed, previous);
    return;
  }

  const target = refreshed as ESPCDFNode & MatterIdentityFields;
  target.isMatter = true;
  target.matterNodeId ??= previous.matterNodeId;
  target.nodeType ??= previous.nodeType;
  // The base rebuild stamps its own adaptor id; a Matter node must keep the
  // Matter adaptor as its owner or control/subscribe calls misroute.
  if (previous.identifier) {
    target.identifier = previous.identifier;
  }

  const previousMeta = previous.metadata as Record<string, unknown> | undefined;
  if (!previousMeta) {
    return;
  }
  const mergedMeta = (refreshed.metadata ?? {}) as Record<string, unknown>;
  for (const key of [MATTER_METADATA_KEY, MATTER_METADATA_NODE_ID_KEY]) {
    if (mergedMeta[key] === undefined && previousMeta[key] !== undefined) {
      mergedMeta[key] = previousMeta[key];
    }
  }
  refreshed.metadata = mergedMeta as ESPCDFNode["metadata"];
}

/**
 * Carries a hybrid's Matter operational id across a refresh — the id alone.
 *
 * A hybrid never sets `isMatter` (it gates Control's Matter-only read and the
 * node-id fallback in `readMatterNodeIdFromCdfNode`), so it fell straight
 * through the guard above and a `getNodeDetails` rebuild dropped its id. Local
 * discovery then lost it from the CHIP target list seconds after finding it.
 * @param refreshed - Newly transformed CDF node about to replace the stored one.
 * @param previous - Node currently in the store.
 */
function preserveHybridMatterNodeId(
  refreshed: ESPCDFNode,
  previous: ESPCDFNode & MatterIdentityFields,
): void {
  const previousMeta = previous.metadata as Record<string, unknown> | undefined;
  const previousId =
    previous.matterNodeId ??
    (typeof previousMeta?.[MATTER_METADATA_NODE_ID_KEY] === "string"
      ? (previousMeta[MATTER_METADATA_NODE_ID_KEY] as string)
      : undefined);
  if (!previousId) {
    return;
  }

  const target = refreshed as ESPCDFNode & MatterIdentityFields;
  target.matterNodeId ??= previousId;
  const mergedMeta = (refreshed.metadata ?? {}) as Record<string, unknown>;
  mergedMeta[MATTER_METADATA_NODE_ID_KEY] ??= previousId;
  refreshed.metadata = mergedMeta as ESPCDFNode["metadata"];
}
