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
import { DEFAULT_HOME_GROUP_NAME } from "@store";
import type { ESPRMNGGroup, ESPRMNGUser } from "@espressif/rmng-base-sdk";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { transformToESPCDFGroup } from "./transformers/transformToESPCDFGroup";
import { logRmngGroupsFabricsRaw } from "./utils/rmngAdaptorDebugLog";

const USER_PERMISSION = "user";

/** Maps SDK groups to CDF via base group transform. */
export function transformRmngSdkGroupsToCdf(
  esprmngUser: ESPRMNGUser,
  groups: ESPRMNGGroup[],
): ESPCDFGroup[] {
  return groups.map((group) =>
    transformToESPCDFGroup(group, esprmngUser, ESPRMNGBaseAdaptorIdentifier),
  );
}

/**
 * Pure-RMNG home sync: load groups, select home, fetch nodes for selected home.
 * Mirrors {@link ESPRMBase/groupSync.syncHomeWithNodes} layout; RMNG awaits MQTT
 * before node fetch (shadow subscriptions require a live connection).
 */
export async function syncHomeWithNodes(
  user: ESPCDFUser,
  callbacks: GroupStoreCallbacks,
  esprmngUser: ESPRMNGUser,
  mqttConnectionPromise: Promise<unknown>,
): Promise<ESPCDFGroup | null> {
  await mqttConnectionPromise;

  const groups = await esprmngUser.getGroups();
  logRmngGroupsFabricsRaw("syncHomeWithNodes", { sdkGroups: groups });
  let cdfGroups = transformRmngSdkGroupsToCdf(esprmngUser, groups);

  if (cdfGroups.length === 0) {
    const newHome = await esprmngUser.createGroup(DEFAULT_HOME_GROUP_NAME);
    cdfGroups = transformRmngSdkGroupsToCdf(esprmngUser, [newHome]);
  }

  callbacks.setGroupsList(cdfGroups);

  const preferredId = (user.customData as { lastSelectedHomeId?: { value?: string } })
    ?.lastSelectedHomeId?.value;
  const selectedHome =
    cdfGroups.find((home) => home.id === preferredId) ?? cdfGroups[0] ?? null;

  callbacks.setCurrentHomeId(selectedHome?.id ?? null);
  if (selectedHome) {
    await persistLastSelectedHomeId(user, selectedHome.id);
  }

  if (selectedHome) {
    await syncNodesForGroup(selectedHome, callbacks);
  }

  return selectedHome;
}

export async function setCurrentHome(
  user: ESPCDFUser,
  callbacks: GroupStoreCallbacks,
  home: ESPCDFGroup,
): Promise<void> {
  callbacks.setCurrentHomeId(home.id);
  await persistLastSelectedHomeId(user, home.id);
}

/** Creates a new SDK home group (CDF mapping done by caller). */
export async function createHome(
  esprmngUser: ESPRMNGUser,
  params: ESPCDFCreateHomeRequestParams,
): Promise<ESPRMNGGroup> {
  return esprmngUser.createGroup(params.name);
}

async function syncNodesForGroup(
  group: ESPCDFGroup,
  callbacks: GroupStoreCallbacks,
): Promise<void> {
  try {
    const nodes = await group.getNodes();
    if (nodes.length > 0) {
      callbacks.addNodesToGroup(group.id, nodes);
    }
  } catch (error) {
    console.error(`[groupSync] Failed to sync nodes for group ${group.id}:`, error);
  }
}

async function persistLastSelectedHomeId(
  user: ESPCDFUser,
  homeId: string,
): Promise<void> {
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
  } catch (error) {
    console.error("[groupSync] Failed to persist lastSelectedHomeId:", error);
  }
}
