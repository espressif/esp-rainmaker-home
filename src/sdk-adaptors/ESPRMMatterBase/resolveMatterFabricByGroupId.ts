/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMUser } from "@espressif/rainmaker-base-sdk";
import { ESPRMFabric } from "@espressif/rainmaker-matter-sdk";
import type { ESPRMGetGroupsRequestParams } from "@espressif/rainmaker-matter-sdk";

const FABRIC_LOOKUP_REQUEST: ESPRMGetGroupsRequestParams = {
  fabricOnly: true,
  withFabricDetails: true,
};

/**
 * Resolves a Matter fabric by RainMaker group id via `ESPRMUser.getGroups`.
 *
 * Replaces removed `ESPRMUser.getFabricById`.
 * @param user - Authenticated SDK user
 * @param groupId - RainMaker group / fabric id
 * @returns Matching `ESPRMFabric`
 */
export async function resolveMatterFabricByGroupId(
  user: ESPRMUser,
  groupId: string,
): Promise<ESPRMFabric> {
  let page = await user.getGroups(FABRIC_LOOKUP_REQUEST);

  while (true) {
    const match = page.groups?.find(
      (group) => group.id === groupId && group.isMatter,
    );
    if (match) {
      return match instanceof ESPRMFabric ? match : new ESPRMFabric(match);
    }
    if (!page.hasNext || !page.fetchNext) {
      break;
    }
    page = await page.fetchNext();
  }

  throw new Error(`Fabric not found with groupId: ${groupId}`);
}
