/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPCDFGroup,
  ESPCDFUser,
  ESPCDFNode,
  GroupStoreCallbacks,
  ESPCDFPaginatedAPIResponse,
} from "@store";
import { DEFAULT_HOME_GROUP_NAME } from "@store";
import type { ESPRMNGGroup, ESPRMNGUser } from "@espressif/rmng-base-sdk";
import { ESPRMNGMatterBaseAdaptorIdentifier } from "./constants";
import { transformToESPCDFGroup } from "./transformers/transformToESPCDFGroup";
import { invalidateRawNodeGroupsCache } from "./utils/rmngRawNodeGroupsCache";
import { refreshRmngMatterGroupIdCache } from "./utils/rmngMatterGroupIdCache";
import { logRmngGroupsFabricsWithRawApi } from "./utils/rmngMatterAdaptorDebugLog";
import { ensureRmngMatterSdkIfNeeded } from "./rmngMatterLazyInit";
import { refreshPureMatterCdfNodeIfNeeded } from "./transformers/refreshRmngPureMatterCdfNode";

/** Refreshes Matter group cache after SDK `getGroups` (mirrors legacy Matter pre-map setup). */
export async function prepareRmngMatterGroupsContext(
  esprmngUser: ESPRMNGUser,
  logLabel: string,
): Promise<ESPRMNGGroup[]> {
  const groups = await esprmngUser.getGroups();
  invalidateRawNodeGroupsCache();
  await logRmngGroupsFabricsWithRawApi(logLabel, groups);
  await refreshRmngMatterGroupIdCache();
  await ensureRmngMatterSdkIfNeeded({ groups });
  return groups;
}

/**
 * Maps SDK groups to CDF via Matter group transform (mirrors
 * {@link ESPRMMatterBase/groupSync.transformMatterSdkGroupsPageToCdf}).
 */
export function transformRmngMatterSdkGroupsToCdf(
  esprmngUser: ESPRMNGUser,
  groups: ESPRMNGGroup[],
): ESPCDFGroup[] {
  return groups.map((group) =>
    transformToESPCDFGroup(
      group,
      esprmngUser,
      ESPRMNGMatterBaseAdaptorIdentifier,
    ),
  );
}

export function transformRmngMatterSdkGroupsPageToCdf(
  esprmngUser: ESPRMNGUser,
  groups: ESPRMNGGroup[],
): ESPCDFPaginatedAPIResponse<ESPCDFGroup[]> {
  const cdfGroups = transformRmngMatterSdkGroupsToCdf(esprmngUser, groups);
  return {
    data: cdfGroups,
    pagination: {
      hasNext: false,
      fetchNext: undefined,
    },
  } as ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>;
}

async function persistLastSelectedHomeId(
  user: ESPCDFUser,
  homeId: string,
): Promise<void> {
  try {
    await user.setCustomData({
      lastSelectedHomeId: {
        value: homeId,
        perms: [{ read: ["user"] }, { write: ["user"] }],
      },
    });
  } catch (error) {
    console.error(
      "[rmngMatterGroupSync] Failed to persist lastSelectedHomeId:",
      error,
    );
  }
}

/**
 * Matter-stack home sync: Matter group transform + RMNG MQTT wait (mirrors
 * {@link ESPRMMatterBase/groupSync.syncHomeWithNodes} shape; node load via CDF
 * `getNodes` so Matter group wrapper controls node path).
 */
export async function syncRmngMatterHomeWithNodes(
  user: ESPCDFUser,
  callbacks: GroupStoreCallbacks,
  esprmngUser: ESPRMNGUser,
  mqttConnectionPromise: Promise<unknown>,
): Promise<ESPCDFGroup | null> {
  await mqttConnectionPromise;

  const groups = await prepareRmngMatterGroupsContext(
    esprmngUser,
    "syncHomeWithNodes",
  );

  let cdfGroups = transformRmngMatterSdkGroupsToCdf(esprmngUser, groups);

  if (cdfGroups.length === 0) {
    const newHome = await esprmngUser.createGroup(DEFAULT_HOME_GROUP_NAME);
    cdfGroups = [
      transformToESPCDFGroup(
        newHome,
        esprmngUser,
        ESPRMNGMatterBaseAdaptorIdentifier,
      ),
    ];
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

  const syncNodesForGroup = async (group: ESPCDFGroup): Promise<void> => {
    try {
      const nodes = await group.getNodes();
      if (nodes.length > 0) {
        callbacks.addNodesToGroup(group.id, nodes);
        await Promise.allSettled(
          nodes.map((node: ESPCDFNode) =>
            refreshPureMatterCdfNodeIfNeeded(node.id, node),
          ),
        );
      }
    } catch (error) {
      console.error(
        `[rmngMatterGroupSync] Failed to sync nodes for group ${group.id}:`,
        error,
      );
    }
  };

  const syncHomeAndRooms = async (home: ESPCDFGroup): Promise<void> => {
    await syncNodesForGroup(home);
    // Matter fabric nodes are loaded at home level; rooms are membership only.
    // Room getNodes uses the base path (no Matter override) and breaks hybrid/pure
    // Matter CDF nodes after add-to-room resync.
    if (home.isMatter || !home.subGroups?.length) {
      return;
    }
    await Promise.allSettled(
      home.subGroups.map((room) => syncNodesForGroup(room)),
    );
  };

  if (selectedHome) {
    await syncHomeAndRooms(selectedHome);
  }

  return selectedHome;
}
