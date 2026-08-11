/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode, ESPCDFUser } from "@store";
import { pollUntilReady } from "./common";
import {
  applyProvisionNodeTimezoneWithRetries,
  markProvisionTimezoneFailed,
} from "./timezone";

const LOG_PREFIX = "[provisionNode]";

/** Progress payload shared by the provision and retry callbacks. */
interface ProvisionProgressResponse {
  status?: string;
  description?: string;
  data?: Record<string, unknown>;
}

/** Node ids are opaque and space-free; a succeed description this long is the id itself. */
const NODE_ID_MIN_LENGTH = 16;

/**
 * Reads the node id a provision / retry progress update carries.
 * @param response - One progress update from the SDK.
 * @returns The node id, or null when the update carries none.
 */
export const captureProvisionNodeId = (
  response: ProvisionProgressResponse
): string | null => {
  const nodeId = response.data?.nodeId;
  if (typeof nodeId === "string" && nodeId) {
    return nodeId;
  }

  const description = response.description;
  if (
    response.status === "succeed" &&
    description &&
    !description.includes(" ") &&
    description.length >= NODE_ID_MIN_LENGTH
  ) {
    return description;
  }

  return null;
};

/**
 * Waits for the cloud to expose a just-provisioned node, then applies the
 * phone's timezone. Shared by the first attempt and the Wi-Fi-reset retry.
 * @param user - Signed-in user the node belongs to.
 * @param nodeId - Node id reported by the provisioning flow.
 * @param neoLiveVerify - True on Neo; attaches the MQTT transport the TZ write needs.
 * @returns The node, or null when the cloud never exposed it.
 */
export async function finalizeProvisionedNode(
  user: ESPCDFUser,
  nodeId: string,
  neoLiveVerify = false
): Promise<ESPCDFNode | null> {
  let node: ESPCDFNode;
  try {
    let pollAttempt = 0;
    const pollResult = await pollUntilReady(
      async () => {
        pollAttempt++;
        try {
          return (await user.getNodeDetails(nodeId)) ?? null;
        } catch (e) {
          console.error(
            `${LOG_PREFIX} Poll attempt ${pollAttempt}: getNodeDetails failed`,
            e instanceof Error ? e.message : e
          );
          return null;
        }
      },
      { maxAttempts: 8, intervalMs: 2000, label: "Waiting for node after provision" }
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
    return null;
  }

  // Timezone is best-effort: a node without it is still usable.
  try {
    const tzResult = await applyProvisionNodeTimezoneWithRetries(
      user,
      nodeId,
      node,
      (id) => user.getNodeDetails(id),
      { neoLiveVerify }
    );
    node = tzResult.node;
    if (!tzResult.timezoneApplied) {
      console.warn(`${LOG_PREFIX} setTimeZone did not succeed; nodeId=`, nodeId);
    }
  } catch (tzError) {
    markProvisionTimezoneFailed(nodeId);
    console.error(`${LOG_PREFIX} Timezone setup failed (non-blocking):`, tzError);
  }

  return node;
}
