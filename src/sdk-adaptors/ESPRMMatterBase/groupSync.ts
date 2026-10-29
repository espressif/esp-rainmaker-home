/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFUser,
  ESPCDFGroup,
  GroupStoreCallbacks,
  ESPCDFPaginatedAPIResponse,
} from "@store";
import {
  getValidHomes,
  ensureHomesAreMutuallyExclusive,
  findHomeGroup,
  categorizeGroupsByOwnership,
  ensureDefaultHomeForNewOrMigratedUser,
} from "@store";
import { setCurrentHome as esprmSetCurrentHome } from "@sdk-adaptors/ESPRMBase/groupSync";
import type { ESPRMGroup, ESPRMUser } from "@espressif/rainmaker-matter-sdk";
import type { ESPRMGetGroupsRequestParams } from "@espressif/rainmaker-matter-sdk";
import { ESPRMMatterBaseAdaptorIdentifier } from "./constants";
import { transformToESPCDFGroup } from "./transformers/transformToESPCDFGroup";
import { fetchMatterGroupNodes } from "./nodeFetch";

type MatterSdkGroupsPage = {
  groups?: ESPRMGroup[];
  hasNext?: boolean;
  fetchNext?: () => Promise<MatterSdkGroupsPage>;
};

const MATTER_HOME_GROUPS_REQUEST = {
  withNodeList: true,
  withSubGroups: true,
} as const;

const MATTER_FABRIC_GROUPS_REQUEST: ESPRMGetGroupsRequestParams = {
  fabricOnly: true,
};

/**
 * Maps one Matter SDK paginated groups page to CDF groups, preserving pagination with CDF-transformed pages.
 * @param esprmUser - Matter SDK user used for group transformation context
 * @param groupsResponse - SDK page from {@link ESPRMUser.getGroups}
 * @returns CDF paginated response with transformed groups
 */
export function transformMatterSdkGroupsPageToCdf(
  esprmUser: ESPRMUser,
  groupsResponse: MatterSdkGroupsPage,
): ESPCDFPaginatedAPIResponse<ESPCDFGroup[]> {
  const groups = groupsResponse.groups ?? [];
  const cdfGroups: ESPCDFGroup[] = groups.map((group: ESPRMGroup) =>
    transformToESPCDFGroup(group, esprmUser as any, ESPRMMatterBaseAdaptorIdentifier),
  );

  const wrapFetchNext = (
    sdkFetchNext: (() => Promise<MatterSdkGroupsPage>) | undefined,
  ): (() => Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>>) | undefined => {
    if (!sdkFetchNext) {
      return undefined;
    }
    return async () => {
      const nextGroupsResponse = await sdkFetchNext();
      return transformMatterSdkGroupsPageToCdf(esprmUser, nextGroupsResponse);
    };
  };

  return {
    data: cdfGroups,
    pagination: {
      hasNext: groupsResponse.hasNext ?? false,
      fetchNext: wrapFetchNext(groupsResponse.fetchNext),
    },
  } as ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>;
}

/**
 * Fetches all RainMaker home groups from the Matter SDK with pagination and CDF transformation.
 * @param esprmUser - Authenticated Matter SDK user
 * @returns All home groups transformed to CDF entities
 */
export async function fetchAllMatterHomeGroups(esprmUser: ESPRMUser): Promise<ESPCDFGroup[]> {
  let response = await esprmUser.getGroups(MATTER_HOME_GROUPS_REQUEST);
  let page = transformMatterSdkGroupsPageToCdf(esprmUser, response);
  const allGroups: ESPCDFGroup[] = [...(page.data ?? [])];

  while (page.pagination?.hasNext && page.pagination?.fetchNext) {
    page = await page.pagination.fetchNext();
    if (page.data) {
      allGroups.push(...page.data);
    }
  }

  return allGroups;
}

/**
 * Fetches all Matter fabric groups from the Matter SDK with pagination and CDF transformation.
 * @param esprmUser - Authenticated Matter SDK user
 * @returns All fabric groups transformed to CDF entities
 */
export async function fetchAllMatterFabricGroups(esprmUser: ESPRMUser): Promise<ESPCDFGroup[]> {
  let response = await esprmUser.getGroups(MATTER_FABRIC_GROUPS_REQUEST);
  let page = transformMatterSdkGroupsPageToCdf(esprmUser, response);
  const allGroups: ESPCDFGroup[] = [...(page.data ?? [])];

  while (page.pagination?.hasNext && page.pagination?.fetchNext) {
    page = await page.pagination.fetchNext();
    if (page.data) {
      allGroups.push(...page.data);
    }
  }

  return allGroups;
}

/**
 * Fetches a single group by id through the Matter SDK and transforms it to CDF.
 * @param esprmUser - Authenticated Matter SDK user
 * @param groupId - RainMaker group or fabric id
 * @param options - Optional Matter/base group fetch flags
 * @returns CDF group with Matter operations attached when applicable
 */
export async function getMatterGroupById(
  esprmUser: ESPRMUser,
  groupId: string,
  options: Record<string, unknown> = {},
): Promise<ESPCDFGroup> {
  const group = await esprmUser.getGroupById({
    id: groupId,
    withNodeDetails: Boolean(options.withNodeDetails),
    withSubGroups: Boolean(options.withSubGroups),
    ...(options.withNodeList !== undefined && {
      withNodeList: Boolean(options.withNodeList),
    }),
    ...(options.withFabricDetails !== undefined && {
      withFabricDetails: Boolean(options.withFabricDetails),
    }),
    ...(options.withMatterNodeList !== undefined && {
      withMatterNodeList: Boolean(options.withMatterNodeList),
    }),
  });

  return transformToESPCDFGroup(
    group,
    esprmUser as any,
    ESPRMMatterBaseAdaptorIdentifier,
  );
}

/** Matter adapter: sync homes and nodes via Matter SDK group APIs. Awaits selected-home nodes; other homes sync in background. */
export async function syncHomeWithNodes(
  user: ESPCDFUser,
  callbacks: GroupStoreCallbacks,
  esprmUser: ESPRMUser,
): Promise<ESPCDFGroup | null> {
  const allGroups = await fetchAllMatterHomeGroups(esprmUser);
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
    await esprmSetCurrentHome(user, callbacks, newHome);
    selected = newHome;
  } else if (selected) {
    await esprmSetCurrentHome(user, callbacks, selected);
  }

  // Await the selected home's nodes so callers treat settle as authoritative
  // for the current-home list.
  await syncSelectedHomeNodes(selected, callbacks, esprmUser);

  return selected;
}

/**
 * Loads the selected home's nodes with one `node_details` call and hands them to
 * the store, which fills the home's rooms from the same reply. Other homes are
 * not fetched here: their nodes load when the user switches to them.
 * @param home - Selected home, or `null` when the user has none yet
 * @param callbacks - Group-store mutators used to attach fetched nodes
 * @param esprmUser - Matter SDK user used when fetching node details
 */
async function syncSelectedHomeNodes(
  home: ESPCDFGroup | null,
  callbacks: GroupStoreCallbacks,
  esprmUser: ESPRMUser,
): Promise<void> {
  if (!home) return;
  try {
    const nodes = await fetchMatterGroupNodes(home, esprmUser);
    if (nodes.length > 0) callbacks.addNodesToGroup(home.id, nodes);
  } catch (e) {
    console.error(`[matterGroupSync] Failed to fetch nodes for home ${home.id}:`, e);
  }
}


