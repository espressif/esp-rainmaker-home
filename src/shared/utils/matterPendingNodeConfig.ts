/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pending pure-Matter node-config pushes (Neo stack).
 *
 * A pure Matter node's endpoint topology reaches the cloud via
 * `PUT /v1/groups/{gid}/nodes/{nid}/config` right after confirm. When that
 * write fails, the node is commissioned and mapped but would render as a blank
 * fallback forever — so the confirm task persists the payload here and group
 * sync re-pushes it (self-heal), clearing the marker on success.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_PREFIX = "matter.pendingNodeConfig.";

export interface PendingNodeConfig {
  neoNodeId: string;
  matterMetadata: Record<string, unknown>;
}

function pendingKey(groupId: string, neoNodeId: string): string {
  return `${PENDING_PREFIX}${groupId}.${neoNodeId}`;
}

/** Persists a pending node-config push for re-delivery on the next sync. */
export async function setPendingNodeConfig(
  groupId: string,
  neoNodeId: string,
  matterMetadata: Record<string, unknown>,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      pendingKey(groupId, neoNodeId),
      JSON.stringify({ neoNodeId, matterMetadata }),
    );
  } catch (error) {
    console.warn("[matterPendingNodeConfig] set failed:", error);
  }
}

/** Removes one pending marker (after a successful re-push). */
export async function clearPendingNodeConfig(
  groupId: string,
  neoNodeId: string,
): Promise<void> {
  try {
    await AsyncStorage.removeItem(pendingKey(groupId, neoNodeId));
  } catch (error) {
    console.warn("[matterPendingNodeConfig] clear failed:", error);
  }
}

/** Lists pending node-config pushes for a group. */
export async function getPendingNodeConfigs(
  groupId: string,
): Promise<PendingNodeConfig[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const groupPrefix = `${PENDING_PREFIX}${groupId}.`;
    const matching = keys.filter((key) => key.startsWith(groupPrefix));
    if (matching.length === 0) {
      return [];
    }
    const entries = await AsyncStorage.multiGet(matching);
    const results: PendingNodeConfig[] = [];
    for (const [, raw] of entries) {
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as PendingNodeConfig;
        if (parsed?.neoNodeId && parsed?.matterMetadata) {
          results.push(parsed);
        }
      } catch {
        // Corrupt marker: skip; it will be overwritten or cleared later.
      }
    }
    return results;
  } catch (error) {
    console.warn("[matterPendingNodeConfig] list failed:", error);
    return [];
  }
}
