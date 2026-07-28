/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDF,
  ESPCDFUser,
  ESPCDFNode,
  ESPCDFGroup,
  ESPCDFService,
  GroupStoreCallbacks,
  AddDeviceParams,
} from "@store";
import { addDeviceProvision as addDeviceProvisionBase } from "@sdk-adaptors/ESPRMBase/addDeviceProvision";
import {
  MATTER_CTL_SETUP_PARAM_RMAKER_GROUP_ID,
  MATTER_CTL_SETUP_SERVICE_TYPE,
} from "../constants";

const LOG_PREFIX = "[Matter-addDeviceProvision]";

/**
 * Looks up the target home group from the CDF store.
 * @param groupId - RainMaker group id from provision params
 * @returns Matching group, or undefined when the store is unavailable
 */
function resolveProvisionGroup(groupId: string): ESPCDFGroup | undefined {
  return ESPCDF.instance?.groupStore.groupsByIDMap?.[groupId];
}

/**
 * Ensures the home is a Matter fabric before controller setup can bind to it.
 * @param group - Target home group
 * @param groupId - RainMaker group id (for logging)
 */
async function ensureMatterFabric(group: ESPCDFGroup, groupId: string): Promise<void> {
  if (group.isMatter) {
    return;
  }

  await group.convertToMatterFabric();
  console.log(`${LOG_PREFIX} group converted to Matter fabric`, {
    groupId,
    groupName: group.name,
  });
}

/**
 * Writes the RainMaker group id onto the node's Matter controller-setup service.
 * @param node - Newly provisioned node
 * @param controllerSetupService - Matter controller-setup service on the node
 * @param groupId - Home group id to bind the Matter controller to
 */
async function bindControllerToGroup(
  node: ESPCDFNode,
  controllerSetupService: ESPCDFService,
  groupId: string,
): Promise<void> {
  const controllerGroupIdParam = controllerSetupService.params?.find(
    (param) => param.type === MATTER_CTL_SETUP_PARAM_RMAKER_GROUP_ID,
  );
  if (!controllerGroupIdParam) {
    console.warn(`${LOG_PREFIX} rmaker-group-id param not found on controller setup service`, {
      nodeId: node.id,
    });
    return;
  }

  await controllerGroupIdParam.setValue(groupId);
  console.log(`${LOG_PREFIX} controller bound to group`, { nodeId: node.id, groupId });
}

/**
 * Matter controller post-provision steps: ensure the home is a fabric, then bind group id.
 * Non-controller nodes skip this path; fabric conversion for commissioning uses consent UI.
 * Failures are logged but non-blocking so the provisioned node is still returned.
 * @param node - Node returned by the base RainMaker provision flow
 * @param groupId - Home group the device was added to
 */
async function runMatterPostProvisionSteps(node: ESPCDFNode, groupId: string): Promise<void> {
  const controllerSetupService = node.services?.find(
    (service) => service.type === MATTER_CTL_SETUP_SERVICE_TYPE,
  );
  if (!controllerSetupService) {
    return;
  }

  const group = resolveProvisionGroup(groupId);
  if (!group) {
    console.warn(`${LOG_PREFIX} target group not found in store; skipping Matter post-steps`, {
      groupId,
      nodeId: node.id,
    });
    return;
  }

  await ensureMatterFabric(group, groupId);
  await bindControllerToGroup(node, controllerSetupService, groupId);
}

/**
 * Matter add-device flow: delegate to RM base provision, then run Matter post-steps.
 * @param user - CDF user performing provision
 * @param params - Wi-Fi provision parameters and progress callback
 * @param callbacks - Group store callbacks for attaching the node to the home
 * @returns Provisioned node, or null when base provision did not yield a node
 */
export async function addDeviceProvision(
  user: ESPCDFUser,
  params: AddDeviceParams,
  callbacks: GroupStoreCallbacks,
): Promise<ESPCDFNode | null> {
  const node = await addDeviceProvisionBase(user, params, callbacks);
  if (!node) {
    return null;
  }

  try {
    await runMatterPostProvisionSteps(node, params.groupId);
  } catch (err) {
    console.error(`${LOG_PREFIX} Matter post-provision steps failed (non-blocking)`, err);
  }

  return node;
}
