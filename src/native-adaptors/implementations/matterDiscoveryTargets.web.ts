/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

let matterDiscoveryTargetNodeIds: string[] = [];

/**
 * Updates the in-memory Matter discovery target list (no native bridge on web).
 * @param nodeIds - Hex Matter node ids from the active Matter home
 */
function setMatterDiscoveryTargetNodeIds(nodeIds: string[]): void {
  matterDiscoveryTargetNodeIds = [...nodeIds];
}

/**
 * Returns the current Matter discovery target node ids.
 * @returns Hex Matter node ids tracked for the active home
 */
function getMatterDiscoveryTargetNodeIds(): readonly string[] {
  return matterDiscoveryTargetNodeIds;
}

/**
 * Syncs target node ids to in-memory state only on web.
 * @param nodeIds - Hex Matter node ids from the active Matter home
 */
function syncMatterDiscoveryTargetNodeIds(nodeIds: string[]): void {
  setMatterDiscoveryTargetNodeIds(nodeIds);
}

export {
  getMatterDiscoveryTargetNodeIds,
  setMatterDiscoveryTargetNodeIds,
  syncMatterDiscoveryTargetNodeIds,
};
