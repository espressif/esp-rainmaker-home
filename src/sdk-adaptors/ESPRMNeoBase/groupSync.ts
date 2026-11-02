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
import type {
  ESPRMNeoGroup,
  ESPRMNeoUser,
} from "@espressif/rainmaker-neo-base-sdk";
import { USER_PERMISSION } from "@shared/utils/constants";
import { withTimeout } from "@shared/utils/asyncTimeout";
import {
  getSessionId,
  isSessionActive,
  throwIfSessionEnded,
} from "@shared/utils/userSession";
import {
  getHomeSyncGiveUpCount,
  HomeSyncGivenUpError,
  throwIfHomeSyncGivenUp,
} from "@shared/utils/homeSyncTracker";
import {
  chooseHomeToShow,
  forgetHomeShownWithoutSaving,
} from "@sdk-adaptors/shared/utils/homeToShow";
import {
  ensureRmneoMqttConnected,
  refreshRmneoMqttCredentials,
} from "./utils/helpers/mqttConnectionHelpers";
import {
  buildNodeSubgroupMembershipMap,
  diffChangedSubgroupMembershipNodeIds,
  resyncMqttAfterSubgroupChange,
  transformRmneoSdkGroupsToCdf,
  defaultGroupTransform,
  type ESPRMNeoGroupTransform,
} from "./utils/helpers/groupHelpers";
import { Logger } from "./utils/logger";
import { ESPRMNEO_CUSTOM_DATA_KEY_LAST_SELECTED_HOME_ID } from "./utils/constants";

/**
 * How long the home load waits for MQTT before it loads over HTTP without it.
 * Its nodes are subscribed once MQTT is up.
 */
const MQTT_WAIT_BEFORE_HOME_MS = 4000;

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
 *
 * Stops before writing if the user logged out meanwhile, so the old
 * account's homes never come back after logout.
 * @param user - CDF user used for custom data and node-update subscriptions.
 * @param callbacks - Group-store mutators (`setGroupsList`, `addNodesToGroup`, …).
 * @param esprmneoUser - RMNeo SDK user for groups / MQTT APIs.
 * @param mqttConnectionPromise - In-flight MQTT connect, waited for at most
 *   {@link MQTT_WAIT_BEFORE_HOME_MS} before node fetch.
 * @returns The selected home group, or `null` when none exist after sync.
 * @throws SessionEndedError when the user logged out during the sync.
 * @throws HomeSyncGivenUpError when the store gave up on this sync.
 */
export async function syncHomeWithNodes(
  user: ESPCDFUser,
  callbacks: GroupStoreCallbacks,
  esprmneoUser: ESPRMNeoUser,
  mqttConnectionPromise: Promise<unknown>,
  transformGroup: ESPRMNeoGroupTransform = defaultGroupTransform,
): Promise<ESPCDFGroup | null> {
  const sessionId = getSessionId();
  const giveUpCountAtStart = getHomeSyncGiveUpCount();
  // Stops before any write once the user logged out, or once the store gave
  // up on this sync (it ran too long and a fresh one started).
  const stopIfSessionEnded = () => {
    throwIfSessionEnded(sessionId, "syncHomeWithNodes");
    throwIfHomeSyncGivenUp(giveUpCountAtStart, "syncHomeWithNodes");
  };

  // On a good network MQTT is up within this wait, which keeps the usual
  // order. Otherwise the home loads without it and the reconnect below
  // subscribes its nodes once MQTT is up; it never blocks the home.
  await withTimeout(
    mqttConnectionPromise,
    MQTT_WAIT_BEFORE_HOME_MS,
    "MQTT is not up yet",
  ).catch(() => {});
  ensureRmneoMqttConnected(esprmneoUser).catch((error: unknown) => {
    Logger.warn("MQTT is not up yet; the home loads without it", error);
  });
  stopIfSessionEnded();

  // Snapshot subgroup membership before this sync overwrites the store, so we
  // can tell afterwards which nodes' rooms/control groups changed and need an
  // MQTT shadow reset. Gate on whether homes were loaded at all (not on whether
  // the map is non-empty) so a node's first subgroup assignment is still diffed.
  const priorHomes = ESPCDF.instance?.groupStore?.groupsList ?? [];
  const membershipBeforeSync = buildNodeSubgroupMembershipMap(priorHomes);

  const groups = await esprmneoUser.getGroups();
  stopIfSessionEnded();

  let cdfGroups = transformRmneoSdkGroupsToCdf(
    esprmneoUser,
    groups,
    transformGroup,
  );

  if (cdfGroups.length === 0) {
    const newHome = await esprmneoUser.createGroup(DEFAULT_HOME_GROUP_NAME);
    stopIfSessionEnded();
    cdfGroups = transformRmneoSdkGroupsToCdf(
      esprmneoUser,
      [newHome],
      transformGroup,
    );
    // MQTT could not connect at login (assume-role answers 409 while the user
    // has no groups); now that a home exists, connect under its policy. Same
    // short wait as above: the home never waits on MQTT.
    await withTimeout(
      refreshRmneoMqttCredentials(esprmneoUser, "home.create"),
      MQTT_WAIT_BEFORE_HOME_MS,
      "MQTT is not up yet",
    ).catch(() => {});
    stopIfSessionEnded();
  }

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

  // This session's home, else the saved choice (read again if it never
  // loaded), else the first home; a fallback never replaces a saved choice.
  const choice = await chooseHomeToShow(
    user,
    cdfGroups,
    ESPCDF.instance?.groupStore?.currentHomeId,
  );
  stopIfSessionEnded();
  const selectedHome = choice.home;
  // The list goes in only now: Home must never see homes with no current one
  // while the saved choice is read, or its recovery would save the first home.
  callbacks.setGroupsList(cdfGroups);
  callbacks.setCurrentHomeId(selectedHome?.id ?? null);

  if (selectedHome) {
    if (choice.saveAsLastChoice) {
      await persistLastSelectedHomeId(user, selectedHome.id);
    }
    stopIfSessionEnded();
    await syncNodesForGroup(selectedHome, callbacks, user, sessionId);
  }

  const { priorityOtherHomes, backgroundHomes } = partitionOtherHomes(
    cdfGroups,
    selectedHome?.id,
    changedNodeIds,
  );

  if (priorityOtherHomes.length > 0) {
    await Promise.all(
      priorityOtherHomes.map((home) =>
        syncNodesForGroup(home, callbacks, user, sessionId),
      ),
    );
  }

  stopIfSessionEnded();
  if (changedNodeIds.length > 0) {
    await resyncMqttAfterSubgroupChange(esprmneoUser, changedNodeIds);
    stopIfSessionEnded();
  }

  backgroundHomes.forEach((home) => {
    void syncNodesForGroup(home, callbacks, user, sessionId);
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
  forgetHomeShownWithoutSaving();
  callbacks.setCurrentHomeId(home.id);
  await persistLastSelectedHomeId(user, home.id);
}

/**
 * Creates a new SDK home group. CDF mapping is done by the caller.
 * @param esprmneoUser - RMNeo SDK user used to create the group.
 * @param params - Create-home request (`name`, …).
 * @returns The newly created SDK group.
 */
export async function createHome(
  esprmneoUser: ESPRMNeoUser,
  params: ESPCDFCreateHomeRequestParams,
): Promise<ESPRMNeoGroup> {
  const created = await esprmneoUser.createGroup(params.name);
  // New home -> new group id outside the current IoT policy. Re-vend now so
  // the first device provisioned here is subscribable on the first attempt.
  await refreshRmneoMqttCredentials(esprmneoUser, "home.create");
  return created;
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
 * Nodes that arrive after logout are dropped.
 * @param group - CDF home / group to sync.
 * @param callbacks - Group-store mutators.
 * @param user - CDF user used for `subscribeToNodeUpdates`.
 * @param sessionId - Session the sync started in.
 */
async function syncNodesForGroup(
  group: ESPCDFGroup,
  callbacks: GroupStoreCallbacks,
  user: ESPCDFUser,
  sessionId: number,
): Promise<void> {
  try {
    const nodes = await group.getNodes();
    if (nodes.length === 0 || !isSessionActive(sessionId)) {
      return;
    }

    callbacks.addNodesToGroup(group.id, nodes);

    // Subscribe as soon as this group's nodes land so a slow background fetch
    // doesn't miss the app-level subscribe pass.
    try {
      await user.subscribeToNodeUpdates({ nodeList: nodes });
    } catch (error) {
      Logger.warn("subscribeToNodeUpdates failed for group", group.id, error);
    }
  } catch (error) {
    // A sync the store gave up on stops here on purpose: not an error.
    if (error instanceof HomeSyncGivenUpError) {
      Logger.log("Skipped late nodes for group", group.id, error.message);
      return;
    }
    Logger.error("Failed to sync nodes for group", group.id, error);
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
        perms: [{ read: [USER_PERMISSION] }, { write: [USER_PERMISSION] }],
      },
    });
  } catch (error) {
    Logger.error("Failed to persist lastSelectedHomeId:", error);
  }
}
