/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const MATTER_STORAGE_PREFIX = "matter.";

function storageKey(nodeId: string, suffix: string): string {
  return `${MATTER_STORAGE_PREFIX}${nodeId}.${suffix}`;
}

/** Persist Matter node ID for an RMNG node (cloud list may omit it for Matter-only nodes). */
export async function setMatterNodeId(
  rmngNodeId: string,
  matterNodeId: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      storageKey(rmngNodeId, "matter_node_id"),
      matterNodeId,
    );
  } catch (error) {
    console.warn("[matterLocalStorage] setMatterNodeId failed:", error);
  }
}

/** Reads the stored Matter node id for an RMNG node, or null. */
export async function getMatterNodeId(
  rmngNodeId: string,
): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(storageKey(rmngNodeId, "matter_node_id"));
  } catch {
    return null;
  }
}

/** Merges and persists Matter metadata for an RMNG node. */
export async function setMatterMetadata(
  rmngNodeId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const existing = await getMatterMetadata(rmngNodeId);
    const merged = { ...existing, ...metadata };
    await AsyncStorage.setItem(
      storageKey(rmngNodeId, "matter_metadata"),
      JSON.stringify(merged),
    );
  } catch (error) {
    console.warn("[matterLocalStorage] setMatterMetadata failed:", error);
  }
}

/** Reads the stored Matter metadata for an RMNG node, or null. */
export async function getMatterMetadata(
  rmngNodeId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(rmngNodeId, "matter_metadata"));
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const MATTER_NODE_ID_HEX_LENGTH = 16;
const HEX_RE = /^[0-9a-fA-F]+$/;

/** Mirrors backend MatterNodeIDFromThingName derivation. */
export function deriveMatterNodeIdFromThingName(thingName: string): string {
  if (!thingName) return "";
  if (
    thingName.length === MATTER_NODE_ID_HEX_LENGTH &&
    HEX_RE.test(thingName)
  ) {
    return thingName.toUpperCase();
  }
  let hexStr = "";
  for (let i = 0; i < thingName.length; i++) {
    hexStr += thingName.charCodeAt(i).toString(16).padStart(2, "0");
  }
  if (hexStr.length < MATTER_NODE_ID_HEX_LENGTH) {
    hexStr = hexStr.padEnd(MATTER_NODE_ID_HEX_LENGTH, "0");
  } else if (hexStr.length > MATTER_NODE_ID_HEX_LENGTH) {
    hexStr = hexStr.slice(0, MATTER_NODE_ID_HEX_LENGTH);
  }
  return hexStr.toUpperCase();
}

/** Resolves an RMNG node's operational Matter node id: group API → discovery → stored → derived. */
export function resolveOperationalMatterNodeId(
  rmngNodeId: string,
  options?: {
    storedId?: string | null;
    discoveryMap?: Record<string, string>;
    fromGroupApi?: string | null;
  },
): string {
  if (!rmngNodeId) return "";
  const fromApi = options?.fromGroupApi?.trim();
  if (fromApi) return fromApi;
  const fromDiscovery = options?.discoveryMap?.[rmngNodeId];
  if (fromDiscovery) return fromDiscovery;
  if (options?.storedId) return options.storedId;
  return deriveMatterNodeIdFromThingName(rmngNodeId);
}
