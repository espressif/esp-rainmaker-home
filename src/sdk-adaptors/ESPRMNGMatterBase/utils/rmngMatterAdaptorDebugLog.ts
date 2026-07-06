/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { logRmngGroupsFabricsRaw } from "@sdk-adaptors/ESPRMNGBase/utils/rmngAdaptorDebugLog";
import { getRawNodeGroupsCached } from "./rmngRawNodeGroupsCache";

/** After `getGroups()`, log SDK groups plus compact wire-format summary from Matter cache. */
export async function logRmngGroupsFabricsWithRawApi(
  source: string,
  sdkGroups: unknown,
): Promise<void> {
  const rawApiResponse = await getRawNodeGroupsCached();
  logRmngGroupsFabricsRaw(source, {
    rawApiResponse,
    sdkGroups,
  });
}
