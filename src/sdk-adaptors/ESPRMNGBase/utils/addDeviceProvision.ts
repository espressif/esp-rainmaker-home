/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPCDFUser,
  ESPCDFNode,
  GroupStoreCallbacks,
  AddDeviceParams,
} from "@store";
import { applyProvisionNodeTimezoneWithRetries } from "@shared/utils/timezone";
import { pollUntilReady } from "@shared/utils/common";
import { ESPRMNGUser, ProvisionType } from "@espressif/rmng-base-sdk";
import { resolveSdkGroupIdForNodeId } from "./resolveSdkGroupForNodeId";

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
  const { provisioningDevice, groupId, ssid, password, onProgress } = params;
  const nodeIdRef: { current: string | null } = { current: null };

  const wrappedOnProgress = (response: {
    status?: string;
    description?: string;
    data?: Record<string, unknown>;
  }) => {
    const data = response.data || {};
    if (data.nodeId) {
      nodeIdRef.current = data.nodeId as string;
    } else if (
      response.status === "succeed" &&
      response.description &&
      !response.description.includes(" ") &&
      response.description.length >= 16
    ) {
      nodeIdRef.current = response.description;
    }
    onProgress?.(
      response as Parameters<NonNullable<AddDeviceParams["onProgress"]>>[0]
    );
  };

  const supportsChalResp =
    await provisioningDevice.checkChallengeResponseSupport();
  if (!supportsChalResp) {
    throw new Error(
      `${LOG_PREFIX} RMNG provisioning requires challenge-response support on the device`,
    );
  }
  const provisionType = ProvisionType.CHAL_RESP;

  try {
    await provisioningDevice.operations.provision(
      ssid,
      password,
      wrappedOnProgress,
      groupId,
      provisionType,
      {
        waitForOnline: true,
        onlineTimeoutMs: 20000,
        user: user._raw,
      }
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Provision failed:`, error);
    console.error(
      `${LOG_PREFIX} Error details:`,
      error instanceof Error ? { message: error.message, stack: error.stack } : error
    );
    throw error;
  }

  const nodeId = nodeIdRef.current;
  if (!nodeId) {
    return null;
  }

  let targetGroupId = groupId;
  try {
    const sdkUser = user._raw as ESPRMNGUser;
    const freshGroups = await sdkUser.getGroups();
    const membershipGroupId = resolveSdkGroupIdForNodeId(freshGroups, nodeId);
    if (membershipGroupId) {
      if (membershipGroupId !== groupId) {
        console.log(
          `${LOG_PREFIX} Node ${nodeId} cloud membership is ${membershipGroupId} (UI home was ${groupId})`,
        );
      }
      targetGroupId = membershipGroupId;
    }
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Could not resolve cloud group for ${nodeId}; using UI home ${groupId}`,
      error instanceof Error ? error.message : error,
    );
  }

  let node: ESPCDFNode;
  try {
    let pollAttempt = 0;
    const pollResult = await pollUntilReady(
      async () => {
        pollAttempt++;
        try {
          const n = await user.getNodeDetails(nodeId);
          return n ?? null;
        } catch (e) {
          console.error(
            `${LOG_PREFIX} Poll attempt ${pollAttempt}: getNodeDetails failed`,
            e instanceof Error ? e.message : e
          );
          return null;
        }
      },
      {
        maxAttempts: 8,
        intervalMs: 500,
        label: "Waiting for node after provision",
      }
    );

    if (!pollResult.success || !pollResult.data) {
      console.error(
        `${LOG_PREFIX} Node not available after ${pollAttempt} attempts - nodeId=${nodeId}`
      );
      return null;
    }
    node = pollResult.data;
  } catch (pollError) {
    console.error(`${LOG_PREFIX} Failed to fetch node:`, pollError);
    console.error(
      `${LOG_PREFIX} Poll error details:`,
      pollError instanceof Error
        ? { message: pollError.message, stack: pollError.stack }
        : pollError
    );
    return null;
  }

  try {
    node = await applyProvisionNodeTimezoneWithRetries(
      user,
      nodeId,
      node,
      (id) => user.getNodeDetails(id)
    );
  } catch (tzError) {
    console.error(`${LOG_PREFIX} Timezone setup failed (non-blocking):`, tzError);
  }

  callbacks.addNodesToGroup(targetGroupId, [node]);
  return node;
}

