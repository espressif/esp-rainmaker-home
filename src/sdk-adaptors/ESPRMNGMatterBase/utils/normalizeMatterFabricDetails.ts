/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFMatterFabricDetails } from "@store";
import type { ESPRMNGGroup } from "@espressif/rmng-base-sdk";
import type { ESPRMNGMatterCapabilityResponse } from "@espressif/rmng-matter-sdk";
import { ESPRMNGFabric } from "@espressif/rmng-matter-sdk";
import { getRmngMatterGroupPayload } from "./rmngMatterGroupIdCache";
import {
  hasRmngMatterCapabilityData,
  isRmngMatterCapableGroup,
} from "./rmngMatterGroupDetection";

/** SDK fabric details plus app-only fields native commissioning reads from nested fabricDetails. */
export type RmngMatterFabricDetailsPayload = ESPRMNGMatterCapabilityResponse & {
  matter_user_id?: string;
  user_cat_id?: string;
};

export function normalizeRmngMatterFabricDetails(
  matter?: ESPRMNGMatterCapabilityResponse | null,
): ESPCDFMatterFabricDetails | undefined {
  if (!matter) return undefined;

  const result: ESPCDFMatterFabricDetails = {
    rootCa: matter.root_ca ?? (matter as { rootCa?: string }).rootCa ?? "",
    matterUserId:
      (matter as { matter_user_id?: string }).matter_user_id ??
      (matter as { matterUserId?: string }).matterUserId ??
      "",
    ipk: matter.ipk,
    groupCatIdOperate:
      matter.group_cat_id_operate ??
      (matter as { groupCatIdOperate?: string }).groupCatIdOperate,
    groupCatIdAdmin:
      matter.group_cat_id_admin ??
      (matter as { groupCatIdAdmin?: string }).groupCatIdAdmin,
    userCatId:
      (matter as { user_cat_id?: string }).user_cat_id ??
      (matter as { userCatId?: string }).userCatId,
  };

  const hasRootCa = Boolean(result.rootCa);
  if (!hasRootCa) {
    return undefined;
  }

  return result;
}

/** Prefer complete Matter details (root CA present) for native commissioning. */
export function resolveCommissioningSdkMatterPayload(
  sdkDetails: RmngMatterFabricDetailsPayload | undefined | null,
  cdfDetails?: ESPCDFMatterFabricDetails | null,
): RmngMatterFabricDetailsPayload {
  const fromCdf = cdfMatterDetailsToSdkPayload(cdfDetails);
  const sdkHasRoot = Boolean(
    sdkDetails?.root_ca ?? (sdkDetails as { rootCa?: string } | undefined)?.rootCa,
  );
  if (sdkHasRoot && sdkDetails) {
    return sdkDetails;
  }
  if (fromCdf) {
    return fromCdf;
  }
  return sdkDetails ?? {};
}

/** Maps CDF fabric details back to the RMNG SDK / native snake_case shape. */
export function cdfMatterDetailsToSdkPayload(
  details?: ESPCDFMatterFabricDetails | null,
): RmngMatterFabricDetailsPayload | undefined {
  if (!details?.rootCa) {
    return undefined;
  }

  return {
    root_ca: details.rootCa,
    ipk: details.ipk,
    group_cat_id_operate: details.groupCatIdOperate,
    group_cat_id_admin: details.groupCatIdAdmin,
    ...(details.matterUserId ? { matter_user_id: details.matterUserId } : {}),
    ...(details.userCatId ? { user_cat_id: details.userCatId } : {}),
  };
}

/**
 * Normalizes fabric-capable SDK groups to {@link ESPRMNGFabric} before adaptor transforms.
 *
 * Mirrors legacy RainMaker {@link ESPRMGroup.isMatter} → {@link ESPRMFabric}: patched
 * Matter `getGroups()` usually returns fabrics when the API includes inline `matter`, but
 * when that payload is missing on the SDK object we recover it from the raw-groups cache
 * (same storage {@link refreshRmngMatterGroupIdCache} reads).
 */
export function enrichRmngSdkGroupWithFabric(
  group: ESPRMNGGroup | ESPRMNGFabric,
): ESPRMNGGroup | ESPRMNGFabric {
  if (isRmngMatterCapableGroup(group)) {
    return group instanceof ESPRMNGFabric
      ? group
      : resolveRmngSdkFabric(group);
  }

  const cachedMatter = getRmngMatterGroupPayload(group.groupId);
  if (!hasRmngMatterCapabilityData(cachedMatter)) {
    return group;
  }

  return resolveRmngSdkFabric({
    groupId: group.groupId,
    groupName: group.groupName,
    nodeIds: group.nodeIds,
    subgroups: group.subgroups,
    nodeDetails: group.nodeDetails,
    fabricDetails: cachedMatter,
  });
}

export function resolveRmngSdkFabric(
  group:
    | ESPRMNGFabric
    | {
        groupId: string;
        groupName?: string;
        nodeIds?: string[];
        subgroups?: unknown[];
        nodeDetails?: ESPRMNGFabric["nodeDetails"];
        fabricDetails?: RmngMatterFabricDetailsPayload;
      },
): ESPRMNGFabric {
  if (group instanceof ESPRMNGFabric) {
    return group;
  }

  const fabricDetails =
    group.fabricDetails ??
    (group as { matter?: RmngMatterFabricDetailsPayload }).matter;
  return new ESPRMNGFabric(
    {
      groupId: group.groupId,
      groupName: group.groupName ?? "",
      nodeIds: group.nodeIds,
      subgroups: group.subgroups as ESPRMNGGroup[] | undefined,
      nodeDetails: group.nodeDetails,
    },
    fabricDetails,
  );
}
