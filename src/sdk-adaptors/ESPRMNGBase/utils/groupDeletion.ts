/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMNGGroup, isChildGroup } from "@espressif/rmng-base-sdk";
import type { RmngSdkApiBody } from "./common";

/**
 * Bridge child nodes ("<parentId>--<childId>") cannot be removed directly;
 * the cloud sweeps them when their parent bridge node is removed and they
 * don't count toward group emptiness.
 */
const isBridgeChildNodeId = (nodeId: string) => nodeId.includes("--");

const removableNodeIds = (group: ESPRMNGGroup): string[] =>
  (group.nodeIds ?? []).filter((id) => !isBridgeChildNodeId(id));

const HTTP_STATUS_CONFLICT = 409;

/**
 * The RMNG cloud rejects deletion of a non-empty group/subgroup with HTTP 409
 * ("group not empty" / "subgroup not empty"). Used to swap the raw cloud
 * message for a localized, actionable one.
 */
export function isGroupNotEmptyError(error: unknown): boolean {
  return (
    (error as { status?: number } | null | undefined)?.status ===
    HTTP_STATUS_CONFLICT
  );
}

/**
 * The RMNG cloud only deletes empty groups/subgroups and rejects the rest
 * with HTTP 409 ("group not empty" / "subgroup not empty"), so deletion is
 * orchestrated here instead of the app layer:
 * - subgroup: remove its nodes (they stay in the parent group), then delete;
 * - root group: remove all nodes (which also clears their subgroup
 *   membership), delete every subgroup, then delete the group.
 * A 409 can still surface on races (e.g. another user added a node mid-way).
 */
export async function emptyAndDeleteRmngGroup(
  group: ESPRMNGGroup
): Promise<RmngSdkApiBody | undefined> {
  const nodeIds = removableNodeIds(group);
  if (nodeIds.length > 0) {
    await Promise.all(nodeIds.map((nodeId) => group.removeNode(nodeId)));
  }
  if (!isChildGroup(group)) {
    for (const subgroup of group.subgroups ?? []) {
      await subgroup.delete();
    }
  }
  return group.delete();
}
