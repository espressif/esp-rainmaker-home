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
  applyProvisionNodeTimezoneWithRetries,
  markProvisionTimezoneFailed,
} from "@shared/utils/timezone";
import { pollUntilReady } from "@shared/utils/common";
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
    const data = response.data || {};
    if (data.nodeId) {
      nodeIdRef.current = data.nodeId as string;
    } else if (response.status === "succeed" && response.description && !response.description.includes(" ") && response.description.length >= 16) {
      nodeIdRef.current = response.description;
    }
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

  let node: ESPCDFNode;
  try {
    let pollAttempt = 0;
    const pollResult = await pollUntilReady(
      async () => {
        pollAttempt++;
        try {
          const n = await user.getNodeDetails(nodeId);
          if (n) {
            return n;
          }
          return null;
        } catch (e) {
          console.error(`${LOG_PREFIX} Poll attempt ${pollAttempt}: getNodeDetails failed`, e instanceof Error ? e.message : e);
          return null;
        }
      },
      { maxAttempts: 8, intervalMs: 2000, label: "Waiting for node after provision" }
    );
    if (!pollResult.success || !pollResult.data) {
      console.error(`${LOG_PREFIX} Node not available after ${pollAttempt} attempts - nodeId=${nodeId}`);
      return null;
    }
    node = pollResult.data;
  } catch (pollError) {
    console.error(`${LOG_PREFIX} Failed to fetch node:`, pollError);
    console.error(`${LOG_PREFIX} Poll error details:`, pollError instanceof Error ? { message: pollError.message, stack: pollError.stack } : pollError);
    return null;
  }

  try {
    const tzResult = await applyProvisionNodeTimezoneWithRetries(
      user,
      nodeId,
      node,
      (id) => user.getNodeDetails(id)
    );
    node = tzResult.node;
    if (!tzResult.timezoneApplied) {
      console.warn(
        `${LOG_PREFIX} Timezone setTimeZone did not succeed (non-blocking); nodeId=`,
        nodeId
      );
    }
  } catch (tzError) {
    markProvisionTimezoneFailed(nodeId);
    console.error(`${LOG_PREFIX} Timezone setup failed (non-blocking):`, tzError);
  }

  callbacks.addNodesToGroup(groupId, [node]);
  return node;
}
