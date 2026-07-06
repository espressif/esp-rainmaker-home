/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGMatterCapabilityResponse } from "@espressif/rmng-matter-sdk";
import { hasRmngMatterCapabilityData } from "./rmngMatterGroupDetection";
import { getRawNodeGroupsCached } from "./rmngRawNodeGroupsCache";

/**
 * Group IDs whose RAW stored `matter` payload carries fabric credentials.
 *
 * Base `getGroups` drops the API `matter` field from the SDK group objects, so
 * the (synchronous) `transformToESPCDFGroup` cannot tell a pure-Matter home
 * from a non-Matter one and never sets `cdfGroup.isMatter` — which makes
 * `startMatterLocalDiscovery` bail (`if (!home.isMatter) return`), so the Matter
 * node is never locally discovered or brought online. We recover the signal
 * from the same raw storage the node collector uses
 * ({@link ESPRMNGStorage.getNodeGroups}, saved by `getGroups`) and expose it
 * synchronously so the group transform can consult it.
 */
const matterPayloadByGroupId = new Map<string, ESPRMNGMatterCapabilityResponse>();

/** Synchronous matter-capability lookup consumed by `transformToESPCDFGroup`. */
export function isRmngMatterGroupIdCached(groupId: string): boolean {
  return matterPayloadByGroupId.has(groupId);
}

/**
 * Matter `fabric_id` recovered for a group ("" when the raw payload lacked it).
 * Base `getGroups` drops `fabric_id` too, so `cdfGroup.fabricId` is empty and the
 * discovery fabric bootstrap (`bootstrapMatterFabricForOperationalDiscovery`,
 * which reads `home.fabricId`) warns "missing fabricId on home" and can't run.
 */
export function getRmngMatterGroupFabricId(groupId: string): string | undefined {
  const matter = matterPayloadByGroupId.get(groupId);
  return (
    matter?.fabric_id ||
    (matter as { fabricId?: string } | undefined)?.fabricId ||
    undefined
  );
}

/**
 * Full raw `matter` capability payload recovered from storage for a group.
 * Base `getGroups` strips `group.matter`/`group.fabricDetails` from the SDK group,
 * so we re-attach this onto the group in `transformToESPCDFGroup` to restore the
 * exact signal every `readRmngMatterCapabilityPayload` consumer relies on (matter
 * detection, fabricId resolution, synthetic pure-Matter capability). NOTE: the
 * groups-list summary carries `fabric_id`/CAT ids but NOT `root_ca`/`ipk` cert
 * content — those are resolved later via the async `getFabricDetails()` op.
 */
export function getRmngMatterGroupPayload(
  groupId: string,
): ESPRMNGMatterCapabilityResponse | undefined {
  return matterPayloadByGroupId.get(groupId);
}

/**
 * Rebuilds the cache from raw stored groups. Call after each `getGroups()` and
 * before transforming groups to CDF, so `home.isMatter` reflects the dropped
 * `matter` payload for the current sync.
 */
export async function refreshRmngMatterGroupIdCache(): Promise<void> {
  try {
    const raw = await getRawNodeGroupsCached();
    const next = new Map<string, ESPRMNGMatterCapabilityResponse>();
    for (const g of raw?.groups ?? []) {
      const matter = (g as { matter?: ESPRMNGMatterCapabilityResponse }).matter;
      if (hasRmngMatterCapabilityData(matter)) {
        next.set(g.group_id, matter as ESPRMNGMatterCapabilityResponse);
      }
    }
    matterPayloadByGroupId.clear();
    for (const [id, payload] of next) {
      matterPayloadByGroupId.set(id, payload);
    }
  } catch (error) {
    console.warn(
      "[rmngMatterGroupIdCache] failed to refresh from storage",
      error,
    );
  }
}
