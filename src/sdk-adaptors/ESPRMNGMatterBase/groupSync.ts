/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPCDFCommissioningProgress,
  ESPCDFGroup,
  ESPCDFGroupOperation,
  ESPCDFIssueUserNoCResponse,
  ESPCDFMatterFabricDetails,
} from "@store";
import { ESPRMNGUser, ESPRMNGStorage, ESPRMNGGroup } from "@espressif/rmng-base-sdk";
import {
  ESPRMNGFabric,
  type ESPCommissioningResponse,
} from "@espressif/rmng-matter-sdk";
import { NativeModules } from "react-native";
import { ensureRmngMatterSdkConfigured } from "./ensureMatterSDK";
import {
  normalizeRmngMatterFabricDetails,
  resolveRmngSdkFabric,
  resolveCommissioningSdkMatterPayload,
  type RmngMatterFabricDetailsPayload,
} from "./utils/normalizeMatterFabricDetails";
import {
  isRmngMatterCapableGroup,
  resolveRmngFabricId,
} from "./utils/rmngMatterGroupDetection";
import { isRmngMatterGroupIdCached } from "./utils/rmngMatterGroupIdCache";
import { logRmngGroupsFabricsRaw } from "@sdk-adaptors/ESPRMNGBase/utils/rmngAdaptorDebugLog";

type TransformGroupFn = (
  group: ESPRMNGFabric,
  user: ESPRMNGUser,
  identifier: string,
) => ESPCDFGroup;

export function buildRmngMatterGroupOperations(options: {
  group: ESPRMNGFabric;
  user: ESPRMNGUser;
  identifier: string;
  cdfGroup: ESPCDFGroup;
  transformGroup: TransformGroupFn;
}): Partial<ESPCDFGroupOperation> {
  const { group, user, identifier, cdfGroup, transformGroup } = options;

  const matterOps: Partial<ESPCDFGroupOperation> = {
    async getFabricDetails(): Promise<ESPCDFMatterFabricDetails> {
      await ensureRmngMatterSdkConfigured();

      const rawGroup = group as ESPRMNGGroup | ESPRMNGFabric;
      if (!isRmngMatterCapableGroup(rawGroup) && !cdfGroup.isMatter) {
        throw new Error(
          "Group is not a Matter fabric; call convertToMatterFabric first",
        );
      }

      const fabric = resolveRmngSdkFabric(rawGroup);
      const rawApiResponse = await ESPRMNGStorage.getNodeGroups();
      const matterRaw = await fabric.getFabricDetails();

      logRmngGroupsFabricsRaw("getFabricDetails", {
        groupId: fabric.groupId,
        groupName: fabric.groupName,
        resolvedFabricDetails: matterRaw,
        sdkFabricDetails: fabric.fabricDetails,
        rawApiGroup: rawApiResponse?.groups?.find(
          (g) => g.group_id === fabric.groupId,
        ),
      });

      const details = normalizeRmngMatterFabricDetails(matterRaw);
      if (!details?.rootCa) {
        throw new Error("Fabric details incomplete after getFabricDetails");
      }

      cdfGroup.fabricDetails = {
        ...cdfGroup.fabricDetails,
        ...details,
        matterUserId:
          details.matterUserId || cdfGroup.fabricDetails?.matterUserId || "",
      };
      cdfGroup.fabricId = matterRaw.fabric_id ?? resolveRmngFabricId(fabric);
      cdfGroup.isMatter = true;
      return details;
    },

    async convertToMatterFabric(): Promise<ESPCDFGroup> {
      await ensureRmngMatterSdkConfigured();

      const rawGroup = group as ESPRMNGGroup | ESPRMNGFabric;

      // Rainmaker parity: convert when not Matter yet, then always fetch fabric details.
      let fabric: ESPRMNGFabric;
      if (isRmngMatterCapableGroup(rawGroup)) {
        fabric = resolveRmngSdkFabric(rawGroup);
      } else {
        fabric = await (rawGroup as ESPRMNGGroup).convertToFabric();
      }

      const matterRaw = await fabric.getFabricDetails();
      const enrichedFabric = new ESPRMNGFabric(
        {
          groupId: fabric.groupId,
          groupName: fabric.groupName,
          nodeIds: fabric.nodeIds,
          subgroups: fabric.subgroups,
        },
        matterRaw,
      );

      const converted = transformGroup(enrichedFabric, user, identifier);
      const details = normalizeRmngMatterFabricDetails(matterRaw);
      if (!details?.rootCa) {
        throw new Error("Fabric details incomplete after convertToMatterFabric");
      }

      converted.fabricDetails = details;
      converted.fabricId =
        matterRaw.fabric_id ?? resolveRmngFabricId(enrichedFabric);
      converted.isMatter = true;
      return converted;
    },
  };

  if (
    !isRmngMatterCapableGroup(group) &&
    !isRmngMatterGroupIdCached(group.groupId)
  ) {
    return matterOps;
  }

  return {
    ...matterOps,
    async issueUserNoC(): Promise<ESPCDFIssueUserNoCResponse> {
      await ensureRmngMatterSdkConfigured();

      const fabric = resolveRmngSdkFabric(group);
      const response = await fabric.issueUserNoC();

      const matterUserId = response.matter_user_id;
      const existingDetails: ESPCDFMatterFabricDetails =
        cdfGroup.fabricDetails ??
        normalizeRmngMatterFabricDetails(fabric.fabricDetails) ?? {
          rootCa: "",
          matterUserId: "",
        };
      cdfGroup.fabricDetails = {
        ...existingDetails,
        ...(matterUserId ? { matterUserId } : {}),
      };

      return {
        status: "success",
        description: response.message ?? "User NOC issued",
        certificates: [
          {
            groupId: group.groupId,
            userNoC: response.noc,
            matterUserId,
          },
        ],
      };
    },

    async startCommissioning(
      qrData: string,
      onProgress?: (message: ESPCDFCommissioningProgress) => void,
    ): Promise<() => void> {
      await ensureRmngMatterSdkConfigured();

      const sdkMatterDetails = resolveCommissioningSdkMatterPayload(
        group.fabricDetails ??
          (group as { matter?: RmngMatterFabricDetailsPayload }).matter,
        cdfGroup.fabricDetails,
      );
      const fabric = resolveRmngSdkFabric({
        groupId: group.groupId,
        groupName: group.groupName,
        nodeIds: group.nodeIds,
        subgroups: group.subgroups,
        fabricDetails: sdkMatterDetails,
      });

      try {
        await NativeModules.ESPMatterModule?.setCurrentFabric?.(
          fabric.groupId,
          fabric.groupName ?? "",
        );
      } catch {
        // best-effort native fabric context
      }

      const sdkOnProgress = (progress: ESPCommissioningResponse) => {
        onProgress?.({
          status: progress.status,
          description: progress.description,
        });
      };

      return fabric.startCommissioning(qrData, sdkOnProgress);
    },
  };
}

export function applyRmngMatterFieldsToCdfGroup(
  cdfGroup: ESPCDFGroup,
  group: ESPRMNGFabric,
): void {
  if (!isRmngMatterCapableGroup(group)) {
    return;
  }

  const fabricDetails = normalizeRmngMatterFabricDetails(
    group.fabricDetails,
  );
  if (!fabricDetails?.rootCa) {
    return;
  }

  cdfGroup.isMatter = true;
  cdfGroup.fabricId = resolveRmngFabricId(group);
  if (!cdfGroup.fabricDetails?.rootCa) {
    cdfGroup.fabricDetails = fabricDetails;
  } else {
    cdfGroup.fabricDetails = {
      ...cdfGroup.fabricDetails,
      ...fabricDetails,
      matterUserId:
        fabricDetails.matterUserId ||
        cdfGroup.fabricDetails.matterUserId ||
        "",
    };
  }
}
