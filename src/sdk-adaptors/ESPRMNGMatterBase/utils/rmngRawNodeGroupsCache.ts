/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNGStorage,
  type ESPNodeGroupsResponse,
} from "@espressif/rmng-base-sdk";

const LOG = "[rmngRawNodeGroups]";

let cached: ESPNodeGroupsResponse | null = null;
let inflight: Promise<ESPNodeGroupsResponse | null> | null = null;
let hitCount = 0;

/** Memoized raw node-groups read; shared across one sync pass. */
export async function getRawNodeGroupsCached(): Promise<ESPNodeGroupsResponse | null> {
  if (cached) {
    hitCount += 1;
    console.log(`${LOG} serve (hit n=${hitCount})`);
    return cached;
  }
  if (inflight) {
    return inflight;
  }
  console.log(`${LOG} read (miss)`);
  inflight = ESPRMNGStorage.getNodeGroups()
    .then((response) => {
      cached = response;
      return response;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Call right after `esprmngUser.getGroups()` (which rewrites storage). */
export function invalidateRawNodeGroupsCache(): void {
  cached = null;
  inflight = null;
  hitCount = 0;
}

/** Test isolation — parity with `resetRmngMatterSdkConfiguredForTests`. */
export function resetRawNodeGroupsCacheForTests(): void {
  invalidateRawNodeGroupsCache();
}
