/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPCDFCreateHomeRequestParams,
  ESPCDFGroup,
  ESPCDFUser,
  GroupStoreCallbacks,
} from "@store";
import { DEFAULT_HOME_GROUP_NAME, ESPCDF } from "@store";
import type { ESPRMNeoGroup, ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import { USER_PERMISSION } from "@shared/utils/constants";
import { ensureRmneoMqttConnected } from "./utils/helpers/mqttConnectionHelpers";
import { logRmneoGroupsRaw } from "./utils/helpers/debugLogHelpers";
import {
  buildNodeSubgroupMembershipMap,
  diffChangedSubgroupMembershipNodeIds,
  resyncMqttAfterSubgroupChange,
  transformRmneoSdkGroupsToCdf,
} from "./utils/helpers/groupHelpers";
import { Logger } from "./utils/logger";
import { ESPRMNEO_CUSTOM_DATA_KEY_LAST_SELECTED_HOME_ID } from "./utils/constants";

type LastSelectedHomeCustomData = {
  [ESPRMNEO_CUSTOM_DATA_KEY_LAST_SELECTED_HOME_ID]?: { value?: string };
};

/**
 * Loads homes, syncs nodes for the preferred home, then syncs other homes so
 * every accessible node can MQTT-subscribe.
 *
 * Side effects: updates the group store, may create a default home, persists
 * `lastSelectedHomeId`, and resyncs MQTT when subgroup membership changed.
 * Sequencing is intentional — preferred home first, then priority others,
 * then MQTT resync, then background homes — do not reorder.
 * @param user - CDF user used for custom data and node-update subscriptions.
 * @param callbacks - Group-store mutators (`setGroupsList`, `addNodesToGroup`, …).
 * @param esprmngUser - RMNeo SDK user for groups / MQTT APIs.
 * @param mqttConnectionPromise - In-flight MQTT connect to await before node fetch.
 * @returns The selected home group, or `null` when none exist after sync.
 */
export async function syncHomeWithNodes(
  user: ESPCDFUser,
  callbacks: GroupStoreCallbacks,
  esprmngUser: ESPRMNeoUser,
  mqttConnectionPromise: Promise<unknown>,
): Promise<ESPCDFGroup | null> {
  await mqttConnectionPromise;
  await ensureRmneoMqttConnected(esprmngUser);

  // Snapshot subgroup membership before this sync overwrites the store, so we
  // can tell afterwards which nodes' rooms/control groups changed and need an
  // MQTT shadow reset. Gate on whether homes were loaded at all (not on whether
  // the map is non-empty) so a node's first subgroup assignment is still diffed.
  const priorHomes = ESPCDF.instance?.groupStore?.groupsList ?? [];
  const membershipBeforeSync = buildNodeSubgroupMembershipMap(priorHomes);

  const groups = await esprmngUser.getGroups();
  logRmneoGroupsRaw("syncHomeWithNodes", {
    sdkGroups: groups,
  });

  let cdfGroups = transformRmneoSdkGroupsToCdf(esprmngUser, groups);

  if (cdfGroups.length === 0) {
    const newHome = await esprmngUser.createGroup(DEFAULT_HOME_GROUP_NAME);
    cdfGroups = transformRmneoSdkGroupsToCdf(esprmngUser, [newHome]);
  }

  callbacks.setGroupsList(cdfGroups);

  // Membership changes include newly accepted shared homes. Defer MQTT reset
  // until those nodes are in the store, then run the same full resync CG
  // create/delete uses.
  const changedNodeIds =
    priorHomes.length > 0
      ? diffChangedSubgroupMembershipNodeIds(
          membershipBeforeSync,
          buildNodeSubgroupMembershipMap(cdfGroups),
        )
      : [];

  const selectedHome = resolveSelectedHome(user, cdfGroups);
  callbacks.setCurrentHomeId(selectedHome?.id ?? null);

  if (selectedHome) {
    await persistLastSelectedHomeId(user, selectedHome.id);
    await syncNodesForGroup(selectedHome, callbacks, user);
  }

  const { priorityOtherHomes, backgroundHomes } = partitionOtherHomes(
    cdfGroups,
    selectedHome?.id,
    changedNodeIds,
  );

  if (priorityOtherHomes.length > 0) {
    await Promise.all(
      priorityOtherHomes.map((home) =>
        syncNodesForGroup(home, callbacks, user),
      ),
    );
  }

  if (changedNodeIds.length > 0) {
    await resyncMqttAfterSubgroupChange(esprmngUser, changedNodeIds);
  }

  backgroundHomes.forEach((home) => {
    void syncNodesForGroup(home, callbacks, user);
  });

  Logger.log("syncHomeWithNodes complete", {
    selectedHomeId: selectedHome?.id ?? null,
    homeCount: cdfGroups.length,
    membershipChangedNodes: changedNodeIds.length,
  });

  return selectedHome;
}

/**
 * Switches the active home in the store and persists the selection.
 * @param user - CDF user whose custom data stores the selection.
 * @param callbacks - Group-store mutators.
 * @param home - Home group to make current.
 */
export async function setCurrentHome(
  user: ESPCDFUser,
  callbacks: GroupStoreCallbacks,
  home: ESPCDFGroup,
): Promise<void> {
  callbacks.setCurrentHomeId(home.id);
  await persistLastSelectedHomeId(user, home.id);
}

/**
 * Creates a new SDK home group. CDF mapping is done by the caller.
 * @param esprmngUser - RMNeo SDK user used to create the group.
 * @param params - Create-home request (`name`, …).
 * @returns The newly created SDK group.
 */
export async function createHome(
  esprmngUser: ESPRMNeoUser,
  params: ESPCDFCreateHomeRequestParams,
): Promise<ESPRMNeoGroup> {
  return esprmngUser.createGroup(params.name);
}

/**
 * Resolves the preferred home from live store id, then persisted custom data,
 * then the first group in the list.
 * @param user - CDF user that may carry `lastSelectedHomeId` in custom data.
 * @param cdfGroups - Current CDF home list after this sync.
 * @returns Selected home, or `null` when the list is empty.
 */
function resolveSelectedHome(
  user: ESPCDFUser,
  cdfGroups: ESPCDFGroup[],
): ESPCDFGroup | null {
  const storeCurrentHomeId = ESPCDF.instance?.groupStore?.currentHomeId ?? null;
  const persistedId = getPersistedLastSelectedHomeId(user);
  const preferredId = storeCurrentHomeId ?? persistedId;
  return cdfGroups.find((home) => home.id === preferredId) ?? cdfGroups[0] ?? null;
}

/**
 * Reads the persisted last-selected home id from user custom data.
 * @param user - CDF user with optional custom data blob.
 * @returns Persisted home id, or `undefined` when absent.
 */
function getPersistedLastSelectedHomeId(user: ESPCDFUser): string | undefined {
  const customData = user.customData as LastSelectedHomeCustomData | undefined;
  return customData?.[ESPRMNEO_CUSTOM_DATA_KEY_LAST_SELECTED_HOME_ID]?.value;
}

/**
 * Splits non-selected homes into priority (own membership-changed nodes) vs
 * background (fire-and-forget). Uses Sets so lookups stay O(1).
 * @param cdfGroups - Full CDF home list.
 * @param selectedHomeId - Id of the preferred home already synced, if any.
 * @param changedNodeIds - Node ids whose subgroup membership changed this sync.
 * @returns Priority homes (must finish before MQTT resync) and background homes.
 */
function partitionOtherHomes(
  cdfGroups: ESPCDFGroup[],
  selectedHomeId: string | undefined,
  changedNodeIds: string[],
): { priorityOtherHomes: ESPCDFGroup[]; backgroundHomes: ESPCDFGroup[] } {
  const otherHomes = cdfGroups.filter((home) => home.id !== selectedHomeId);
  const changedNodeIdSet = new Set(changedNodeIds);

  const priorityOtherHomes = otherHomes.filter((home) =>
    home.nodeIds?.some((nodeId) => changedNodeIdSet.has(nodeId)),
  );
  const priorityHomeIdSet = new Set(priorityOtherHomes.map((home) => home.id));
  const backgroundHomes = otherHomes.filter(
    (home) => !priorityHomeIdSet.has(home.id),
  );

  return { priorityOtherHomes, backgroundHomes };
}

/**
 * Fetches nodes for one home, adds them to the store, and subscribes to updates.
 *
 * Errors are logged and swallowed so one home cannot fail the whole sync.
 * @param group - CDF home / group to sync.
 * @param callbacks - Group-store mutators.
 * @param user - CDF user used for `subscribeToNodeUpdates`.
 */
async function syncNodesForGroup(
  group: ESPCDFGroup,
  callbacks: GroupStoreCallbacks,
  user: ESPCDFUser,
): Promise<void> {
  try {
    const nodes = await group.getNodes();
    if (nodes.length === 0) {
      return;
    }

    callbacks.addNodesToGroup(group.id, nodes);

    // Subscribe as soon as this group's nodes land so a slow background fetch
    // doesn't miss the app-level subscribe pass.
    try {
      await user.subscribeToNodeUpdates({ nodeList: nodes });
    } catch (error) {
      Logger.warn(
        "subscribeToNodeUpdates failed for group",
        group.id,
        error,
      );
    }
  } catch (error) {
    Logger.error(
      "Failed to sync nodes for group",
      group.id,
      error,
    );
  }
}

/**
 * Persists `lastSelectedHomeId` on the user. Skips the network write when the
 * value is already current.
 * @param user - CDF user whose custom data is updated.
 * @param homeId - Home id to persist.
 */
async function persistLastSelectedHomeId(
  user: ESPCDFUser,
  homeId: string,
): Promise<void> {
  if (getPersistedLastSelectedHomeId(user) === homeId) {
    return;
  }

  try {
    await user.setCustomData({
      [ESPRMNEO_CUSTOM_DATA_KEY_LAST_SELECTED_HOME_ID]: {
        value: homeId,
        perms: [
          { read: [USER_PERMISSION] },
          { write: [USER_PERMISSION] },
        ],
      },
    });
  } catch (error) {
    Logger.error("Failed to persist lastSelectedHomeId:", error);
  }
}
