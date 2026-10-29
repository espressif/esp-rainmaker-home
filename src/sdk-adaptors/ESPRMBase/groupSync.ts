/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPCDFUser,
  ESPCDFGroup,
  ESPCDFNode,
  GroupStoreCallbacks,
  ESPCDFCreateHomeRequestParams,
} from "@store";
import {
  getValidHomes,
  ensureHomesAreMutuallyExclusive,
  findHomeGroup,
  categorizeGroupsByOwnership,
  GROUP_TYPE_HOME,
  ensureDefaultHomeForNewOrMigratedUser,
} from "@store";
import { transformToESPCDFNodes } from "./transformers/transformToESPCDFNode";
import type { CreateGroupRequest, ESPRMGroup, ESPRMUser } from "@espressif/rainmaker-base-sdk";

const USER_PERMISSION = "user";

/** RainMaker adapter: sync homes and nodes. Awaits selected-home nodes; other homes sync in background via callbacks.addNodesToGroup. */
export async function syncHomeWithNodes(
  user: ESPCDFUser,
  callbacks: GroupStoreCallbacks
): Promise<ESPCDFGroup | null> {
  const allGroups = await fetchAllGroups(user);
  const validHomes = getValidHomes(allGroups);
  const { primaryGroups } = categorizeGroupsByOwnership(validHomes);
  await ensureHomesAreMutuallyExclusive(primaryGroups, true);
  const finalValid = getValidHomes(allGroups);

  callbacks.setGroupsList(finalValid);

  const preferredId = user.customData?.lastSelectedHomeId?.value ?? undefined;
  let selected =
    findHomeGroup(finalValid, { preferredId }) ?? finalValid[0] ?? null;

  if (finalValid.length === 0) {
    const newHome = await ensureDefaultHomeForNewOrMigratedUser(user, [], allGroups);
    callbacks.setCurrentHomeId(newHome.id);
    await persistLastSelectedHomeId(user, newHome.id);
    selected = newHome;
  } else if (selected) {
    callbacks.setCurrentHomeId(selected.id);
    await persistLastSelectedHomeId(user, selected.id);
  }

  // Await the selected home's nodes so callers (Home empty-state gate, login)
  // treat settle as "current-home list is authoritative."
  await syncSelectedHomeNodes(selected, callbacks);

  return selected;
}

async function fetchAllGroups(user: ESPCDFUser): Promise<ESPCDFGroup[]> {
  let resp = await user.getGroups();
  const all: ESPCDFGroup[] = [...(resp.data ?? [])];
  while (resp.pagination?.hasNext && resp.pagination?.fetchNext) {
    resp = await resp.pagination.fetchNext();
    if (resp.data) all.push(...resp.data);
  }
  return all;
}

/**
 * Loads the selected home's nodes with one `node_details` call and hands them to
 * the store, which fills the home's rooms from the same reply. Other homes are
 * not fetched here: their nodes load when the user switches to them.
 * @param home - Selected home, or `null` when the user has none yet
 * @param callbacks - Group-store mutators used to attach fetched nodes
 */
async function syncSelectedHomeNodes(
  home: ESPCDFGroup | null,
  callbacks: GroupStoreCallbacks
): Promise<void> {
  if (!home) return;
  try {
    const nodes = await fetchNodesForGroup(home);
    if (nodes.length > 0) callbacks.addNodesToGroup(home.id, nodes);
  } catch (e) {
    console.error(`[groupSync] Failed to fetch nodes for home ${home.id}:`, e);
  }
}

async function fetchNodesForGroup(group: ESPCDFGroup): Promise<ESPCDFNode[]> {
  const raw = (group as { _raw?: ESPRMGroup })._raw;
  if (!raw) return [];
  const nodes = await raw.getNodesWithDetails();
  return transformToESPCDFNodes(nodes, "groupSync.fetchNodesForGroup");
}

export async function setCurrentHome(
  user: ESPCDFUser,
  callbacks: GroupStoreCallbacks,
  home: ESPCDFGroup
): Promise<void> {
  callbacks.setCurrentHomeId(home.id);
  await persistLastSelectedHomeId(user, home.id);
}

/**
 * Persists `lastSelectedHomeId` in the user's custom data. Skips the network
 * write when the stored value is already current (store-first; the CDF keeps
 * `user.customData` in sync after every custom-data read and write).
 */
async function persistLastSelectedHomeId(
  user: ESPCDFUser,
  homeId: string
): Promise<void> {
  if (user.customData?.lastSelectedHomeId?.value === homeId) return;
  try {
    await user.setCustomData({
      lastSelectedHomeId: {
        value: homeId,
        perms: [
          { read: [USER_PERMISSION] },
          { write: [USER_PERMISSION] },
        ],
      },
    });
  } catch (e) {
    console.error("[groupSync] Failed to persist last selected home:", e);
  }
}

export async function createHome(user: ESPRMUser, params: ESPCDFCreateHomeRequestParams): Promise<ESPRMGroup> {
  const requestPayload: CreateGroupRequest = {
    name: params.name,
    nodeIds: params.nodeIds,
    type: GROUP_TYPE_HOME,
    mutuallyExclusive: true,
    description: "",
    customData: {},
  };
  const newHome = await user.createGroup(requestPayload);
  return newHome;
}
