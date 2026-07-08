/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFGroup, ESPCDFNode } from "@store";
import { ESPCDF } from "@store";
import type { ESPRMNGGroup, ESPRMNGUser } from "@espressif/rmng-base-sdk";
import { ESPRMNGFabric } from "@espressif/rmng-matter-sdk";
import { transformToESPCDFGroupBase } from "@sdk-adaptors/ESPRMNGBase/transformers/transformToESPCDFGroup";
import {
  applyRmngMatterFieldsToCdfGroup,
  buildRmngMatterGroupOperations,
} from "../groupSync";
import {
  isRmngMatterCapableGroup,
  hasRmngMatterCapabilityData,
} from "../utils/rmngMatterGroupDetection";
import {
  isRmngMatterGroupIdCached,
  getRmngMatterGroupFabricId,
} from "../utils/rmngMatterGroupIdCache";
import {
  enrichRmngSdkGroupWithFabric,
  resolveRmngSdkFabric,
} from "../utils/normalizeMatterFabricDetails";
import { isRmngOnlyGroupNodeDetails } from "../utils/rmngGroupNodeDetailsContext";
import { buildMatterCdfNodesFromGroup } from "./buildMatterCdfNodesFromGroup";
import {
  resyncMqttAfterSubgroupChange,
  resolveRmngGroupId,
} from "../rmngMqttShadowResync";
import { installMatterAutomationOpsOverride } from "../utils/matterAutomationGroupOps";

const isSubgroup = (
  group: ESPRMNGGroup,
): group is ESPRMNGGroup & { parentId: string } =>
  group.parentId != null && group.parentId !== "";

function patchSubgroupNodeIdsInStore(
  cdfGroup: ESPCDFGroup,
  sdkGroup: ESPRMNGGroup,
  nodeIds: string[],
): void {
  cdfGroup.nodeIds = nodeIds;
  const store = ESPCDF.instance;
  store?.groupStore?.updateGroup(cdfGroup.id, { nodeIds });

  const parentId = cdfGroup.parentId || sdkGroup.parentId;
  const parent = parentId
    ? store?.groupStore?.groupsByIDMap?.[parentId]
    : undefined;
  if (parent?.subGroups?.length) {
    const idx = parent.subGroups.findIndex((sg) => sg.id === cdfGroup.id);
    if (idx >= 0) {
      parent.subGroups[idx].nodeIds = nodeIds;
    }
  }
}

function wrapSubgroupOpsWithMqttResync(
  cdfGroup: ESPCDFGroup,
  group: ESPRMNGGroup,
  user: ESPRMNGUser,
): void {
  const base = cdfGroup.operations;
  if (!base) {
    return;
  }

  if (base.createSubGroup) {
    const createSubGroup = base.createSubGroup.bind(base);
    cdfGroup.operations.createSubGroup = async (options) => {
      const subgroup = await createSubGroup(options);
      if (options.nodeIds?.length && !isSubgroup(group)) {
        await resyncMqttAfterSubgroupChange({
          esprmngUser: user,
          parentHomeId: cdfGroup.id || resolveRmngGroupId(group),
          parentHomeGroup: group,
          nodeIdsToRefresh: options.nodeIds,
        });
      }
      return subgroup;
    };
  }

  if (base.addNodes) {
    const addNodes = base.addNodes.bind(base);
    cdfGroup.operations.addNodes = async (nodeIds) => {
      const result = await addNodes(nodeIds);
      if (isSubgroup(group)) {
        const roomNodeIds =
          group.nodeIds ??
          [...new Set([...(cdfGroup.nodeIds ?? []), ...nodeIds])];
        patchSubgroupNodeIdsInStore(cdfGroup, group, roomNodeIds);
        await resyncMqttAfterSubgroupChange({
          esprmngUser: user,
          parentHomeId: cdfGroup.parentId || group.parentId,
          nodeIdsToRefresh: roomNodeIds,
        });
      }
      return result;
    };
  }

  if (base.removeNodes) {
    const removeNodes = base.removeNodes.bind(base);
    cdfGroup.operations.removeNodes = async (nodeIds) => {
      const result = await removeNodes(nodeIds);
      if (isSubgroup(group)) {
        const remainingRoomNodeIds =
          group.nodeIds ??
          (cdfGroup.nodeIds ?? []).filter((id) => !nodeIds.includes(id));
        patchSubgroupNodeIdsInStore(cdfGroup, group, remainingRoomNodeIds);
        await resyncMqttAfterSubgroupChange({
          esprmngUser: user,
          parentHomeId: cdfGroup.parentId || group.parentId,
          nodeIdsToRefresh: [...new Set([...nodeIds, ...remainingRoomNodeIds])],
        });
      }
      return result;
    };
  }
}

/**
 * Installs Matter-aware {@link ESPCDFGroup.getNodes} when the home is a fabric with
 * non-RMNG-only nodes — mirrors {@link ESPRMMatterBase/groupSync.fetchNodesForGroup}
 * (`group.isMatter` → `getNodesWithDetails`).
 */
function installMatterGetNodesOverride(
  cdfGroup: ESPCDFGroup,
  sdkGroup: ESPRMNGGroup | ESPRMNGFabric,
  user: ESPRMNGUser,
  identifier: string,
): void {
  if (!cdfGroup.isMatter) {
    return;
  }
  const nodeIds = sdkGroup.nodeIds ?? [];
  if (isRmngOnlyGroupNodeDetails(sdkGroup.nodeDetails, nodeIds)) {
    return;
  }

  cdfGroup.operations.getNodes = async (): Promise<ESPCDFNode[]> => {
    const nodes = await buildMatterCdfNodesFromGroup(sdkGroup, user, identifier);
    const cdf = await ESPCDF.instance;
    cdf?.groupStore.updateGroup(sdkGroup.groupId, { nodeDetails: nodes });
    return nodes;
  };
}

/**
 * RMNG+Matter group wrapper — mirrors {@link ESPRMMatterBase/transformToESPCDFGroup}.
 */
export function transformToESPCDFGroup(
  group: ESPRMNGGroup,
  user: ESPRMNGUser,
  identifier: string,
  inheritedUserAccess?: string,
): ESPCDFGroup {
  const sdkGroup = enrichRmngSdkGroupWithFabric(group);

  const cdfGroup = transformToESPCDFGroupBase(
    sdkGroup,
    user,
    identifier,
    inheritedUserAccess,
  );

  // Base maps subGroups with transformToESPCDFGroupBase only; Matter subgroup ops
  // (MQTT resync on add/remove) must go through this wrapper — same as hook dispatch did.
  if (!isSubgroup(sdkGroup) && sdkGroup.subgroups?.length) {
    cdfGroup.subGroups = sdkGroup.subgroups.map((subgroup) =>
      transformToESPCDFGroup(subgroup, user, identifier, inheritedUserAccess),
    );
  }

  wrapSubgroupOpsWithMqttResync(cdfGroup, sdkGroup, user);

  if (isSubgroup(sdkGroup)) {
    return cdfGroup;
  }

  const fabric = resolveRmngSdkFabric(sdkGroup as ESPRMNGFabric);
  const matterOps = buildRmngMatterGroupOperations({
    group: fabric,
    user,
    identifier,
    cdfGroup,
    transformGroup: (fabricGroup, rmngUser, adaptorId) =>
      transformToESPCDFGroup(fabricGroup as ESPRMNGGroup, rmngUser, adaptorId),
  });
  cdfGroup.operations = {
    ...cdfGroup.operations,
    ...matterOps,
  };
  applyRmngMatterFieldsToCdfGroup(cdfGroup, fabric);
  if (
    !cdfGroup.isMatter &&
    (isRmngMatterCapableGroup(sdkGroup) ||
      isRmngMatterGroupIdCached(sdkGroup.groupId) ||
      hasRmngMatterCapabilityData(
        cdfGroup.fabricDetails as unknown as Parameters<
          typeof hasRmngMatterCapabilityData
        >[0],
      ))
  ) {
    cdfGroup.isMatter = true;
  }
  if (cdfGroup.isMatter && !cdfGroup.fabricId) {
    const cachedFabricId = getRmngMatterGroupFabricId(sdkGroup.groupId);
    if (cachedFabricId) {
      cdfGroup.fabricId = cachedFabricId;
    }
  }

  installMatterGetNodesOverride(cdfGroup, sdkGroup, user, identifier);
  installMatterAutomationOpsOverride(cdfGroup, sdkGroup, identifier);

  return cdfGroup;
}
