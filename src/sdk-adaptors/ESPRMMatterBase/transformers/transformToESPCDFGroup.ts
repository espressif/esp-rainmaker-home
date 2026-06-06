/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
    ESPCDFCommissioningProgress,
    ESPCDFGroup,
    ESPCDFIssueUserNoCResponse,
    ESPCDFMatterFabricDetails,
} from "@store";
import {
  ESPRMFabric,
  ESPRMUser,
  ESPRMGroup,
  type ESPCommissioningResponse,
} from "@espressif/rainmaker-matter-sdk";
import { transformToESPCDFGroup as transformToESPCDFGroupFromESPRMBase } from "@sdk-adaptors/ESPRMBase/transformers/transformToESPCDFGroup";
import { MATTER_NEEDS_FABRIC_CONVERSION } from "../constants";

/**
 * Maps SDK fabric details to the CDF {@link ESPCDFMatterFabricDetails} shape.
 * @param matterFabric - Matter fabric after `getFabricDetails`
 * @returns Normalized fabric credentials, or undefined when empty
 */
export function normalizeMatterFabricDetailsFromSdk(
    matterFabric: ESPRMFabric,
  ): ESPCDFMatterFabricDetails | undefined {
    const result: Record<string, any> = {
      rootCa: matterFabric.fabricDetails?.rootCa ?? (matterFabric.fabricDetails as any)?.root_ca,
      matterUserId: matterFabric.fabricDetails?.matterUserId ?? (matterFabric.fabricDetails as any)?.matter_user_id,
      ipk: matterFabric.fabricDetails?.ipk,
      groupCatIdOperate: matterFabric.fabricDetails?.groupCatIdOperate ?? (matterFabric.fabricDetails as any)?.group_cat_id_operate,
      groupCatIdAdmin: matterFabric.fabricDetails?.groupCatIdAdmin ?? (matterFabric.fabricDetails as any)?.group_cat_id_admin,
      userCatId: matterFabric.fabricDetails?.userCatId ?? (matterFabric.fabricDetails as any)?.user_cat_id,
    };
  
    const hasAny = Object.values(result).some(
      (v) => v !== undefined && v !== null && String(v).length > 0
    );
    return hasAny ? (result as ESPCDFMatterFabricDetails) : undefined;
  }

/**
 * Resolves an SDK {@link ESPRMFabric} instance for Matter-enabled groups.
 * @param item - SDK group or fabric from `getGroups`
 * @returns Fabric handle for Matter SDK calls
 */
function resolveSdkFabric(item: ESPRMGroup | ESPRMFabric): ESPRMFabric {
  if (!item.isMatter) {
    throw new Error(MATTER_NEEDS_FABRIC_CONVERSION);
  }
  return item instanceof ESPRMFabric ? item : new ESPRMFabric(item);
}

/**
 * RainMaker + Matter: reuse ESPRMBase group operations, add fabric commissioning helpers when
 * `group.isMatter` is true. Subgroups returned from base SDK closures still use the base
 * transformer until that pipeline is refactored to accept an injectable subgroup mapper.
 */
export function transformToESPCDFGroup(
    group: ESPRMGroup | ESPRMFabric,
    user: ESPRMUser,
    identifier: string,
): ESPCDFGroup {
    const baseGroup = transformToESPCDFGroupFromESPRMBase(group, user, identifier);

    const matterFabric = group.isMatter ? (group as ESPRMFabric) : null;
    const rawGroup = group;

    const matterFabricOperations = {
        async getFabricDetails(): Promise<ESPCDFMatterFabricDetails> {
            const fabric = resolveSdkFabric(rawGroup);
            await fabric.getFabricDetails();
            const details = normalizeMatterFabricDetailsFromSdk(fabric);
            if (!details?.rootCa || !details.matterUserId) {
                throw new Error("Fabric details incomplete after getFabricDetails");
            }
            return details;
        },
        async convertToMatterFabric(): Promise<ESPCDFGroup> {
            let fabric: ESPRMFabric;
            if (rawGroup.isMatter) {
                fabric = resolveSdkFabric(rawGroup);
                await fabric.getFabricDetails();
            } else {
                fabric = await (rawGroup as ESPRMGroup).convertToFabric();
                await fabric.getFabricDetails();
            }
            return transformToESPCDFGroup(fabric, user, identifier);
        },
        ...(matterFabric
            ? {
                  async issueUserNoC(): Promise<ESPCDFIssueUserNoCResponse> {
                      return await matterFabric.issueUserNoC();
                  },
                  async startCommissioning(
                      qrData: string,
                      onProgress?: (message: ESPCDFCommissioningProgress) => void,
                  ): Promise<() => void> {
                      const sdkOnProgress = (progress: ESPCommissioningResponse) => {
                          onProgress?.({
                              status: progress.status,
                              description: progress.description,
                          });
                      };
                      return await matterFabric.startCommissioning(qrData, sdkOnProgress);
                  },
              }
            : {}),
    };

    baseGroup.operations = {
        ...baseGroup.operations,
        ...matterFabricOperations,
    };
    baseGroup.identifier = identifier;
    if (group instanceof ESPRMFabric) {
        baseGroup.fabricDetails = normalizeMatterFabricDetailsFromSdk(group);
    }
    return baseGroup;
}
