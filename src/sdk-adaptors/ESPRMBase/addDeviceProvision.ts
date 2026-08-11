/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPCDFUser,
  ESPCDFNode,
  GroupStoreCallbacks,
  AddDeviceParams,
} from "@store";
import {
  captureProvisionNodeId,
  finalizeProvisionedNode,
} from "@shared/utils/provisionNode";
import { ProvisionType } from "@espressif/rainmaker-base-sdk";

/**
 * Add device provision flow: provision device, set timezone (for CHAL_RESP),
 * fetch node details, add to group store. Returns the provisioned node.
 */
const LOG_PREFIX = "[addDeviceProvision]";

export async function addDeviceProvision(
  user: ESPCDFUser,
  params: AddDeviceParams,
  callbacks: GroupStoreCallbacks
): Promise<ESPCDFNode | null> {
  const {
    provisioningDevice,
    groupId,
    ssid,
    password,
    onProgress,
  } = params;
  const nodeIdRef: { current: string | null } = { current: null };

  const wrappedOnProgress = (response: { status?: string; description?: string; data?: Record<string, unknown> }) => {
    nodeIdRef.current = captureProvisionNodeId(response) ?? nodeIdRef.current;
    onProgress?.(response as Parameters<NonNullable<AddDeviceParams["onProgress"]>>[0]);
  };

  const provisionType = await provisioningDevice.checkChallengeResponseSupport() ? ProvisionType.CHAL_RESP : ProvisionType.MQTT;

  try {
    await provisioningDevice.operations.provision(
      ssid,
      password,
      wrappedOnProgress,
      groupId,
      provisionType
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Provision failed:`, error);
    console.error(`${LOG_PREFIX} Error details:`, error instanceof Error ? { message: error.message, stack: error.stack } : error);
    throw error;
  }

  const nodeId = nodeIdRef.current;
  if (!nodeId) {
    return null;
  }

  const node = await finalizeProvisionedNode(user, nodeId);
  if (!node) {
    return null;
  }

  callbacks.addNodesToGroup(groupId, [node]);
  return node;
}
