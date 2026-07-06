/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";
import { ESPRMNGBase } from "@espressif/rmng-base-sdk";
import { ESPRMNGFabric } from "@espressif/rmng-matter-sdk";
import { getRMNGMatterSDKConfig } from "@config/sdk.config";
import { runtimeConfigManager } from "@config/runtime.config";
import {
  setMatterMetadata,
  setMatterNodeId,
} from "@shared/utils/matterLocalStorage";
import {
  HEADLESS_TASK_ISSUE_NOC,
  HEADLESS_TASK_CONFIRM_COMMISSION,
  HEADLESS_ERROR_MISSING_TASK_DATA,
  HEADLESS_ERROR_USER_NOT_AUTHENTICATED,
  HEADLESS_ERROR_UNKNOWN,
  HEADLESS_ERROR_NATIVE_MODULE_UNAVAILABLE,
} from "@shared/utils/constants";

const { ESPMatterModule } = NativeModules;

let rmngSdkInitialized = false;

/**
 * True when the base RMNG SDK is already configured in THIS JS runtime.
 * `ESPRMNGBase.subscriptionManager` throws "SDK not initialized" until configure() runs.
 */
function isRmngBaseAlreadyConfigured(): boolean {
  try {
    return !!ESPRMNGBase.subscriptionManager;
  } catch {
    return false;
  }
}

async function initializeRmngMatterSDK(): Promise<void> {
  // On Android, HeadlessJS commissioning tasks can share the app's JS context.
  // ESPRMNGBase.configure() news-up a fresh subscription manager on every call
  // (dropping every registered channel except MQTT), so re-configuring here
  // would wipe the Matter channel the app already registered and knock all
  // Matter nodes offline until it is re-registered. Skip if already configured.
  if (rmngSdkInitialized || isRmngBaseAlreadyConfigured()) {
    rmngSdkInitialized = true;
    return;
  }
  await runtimeConfigManager.loadFromStorage();
  const { ESPRMNGMatterBase } = await import("@espressif/rmng-matter-sdk");
  ESPRMNGMatterBase.configure(getRMNGMatterSDKConfig());
  rmngSdkInitialized = true;
}

interface SigV4CredentialFields {
  sigv4AccessKey?: string;
  sigv4SecretKey?: string;
  sigv4SessionToken?: string;
  sigv4Expiration?: string;
}

interface RmngIssueNocTaskData extends SigV4CredentialFields {
  nodeId: string;
  csr?: string;
  fabricId: string;
  groupId: string;
  requestId: string;
  nocsrElements?: string;
  attestationChallenge?: string;
  attestationSignature?: string;
}

interface RmngConfirmCommissionTaskData extends SigV4CredentialFields {
  nodeId: string;
  fabricId: string;
  groupId: string;
  requestId: string;
  metadata?: string;
  challenge?: string;
  challengeResponse?: string;
}

async function preseedSigV4Credentials(
  data: SigV4CredentialFields,
): Promise<void> {
  if (data.sigv4AccessKey && data.sigv4SecretKey && data.sigv4SessionToken) {
    try {
      const { ESPRMNGStorage } = await import("@espressif/rmng-base-sdk");
      await ESPRMNGStorage.saveTemporaryCredentials({
        accessKey: data.sigv4AccessKey,
        secretKey: data.sigv4SecretKey,
        sessionToken: data.sigv4SessionToken,
        expiration:
          data.sigv4Expiration ||
          new Date(Date.now() + 3600000).toISOString(),
      });
    } catch (error) {
      console.warn("[HeadlessJS] Failed to pre-seed SigV4 credentials:", error);
    }
  }
}

export async function rmngMatterIssueNocTask(
  taskData: RmngIssueNocTaskData,
): Promise<Record<string, unknown>> {
  try {
    await initializeRmngMatterSDK();
    await preseedSigV4Credentials(taskData);

    if (!taskData?.nodeId || !taskData?.requestId || !taskData?.groupId) {
      throw new Error(HEADLESS_ERROR_MISSING_TASK_DATA);
    }

    const authInstance = ESPRMNGBase.getAuthInstance();
    const user = await authInstance.getLoggedInUser();
    if (!user) {
      throw new Error(HEADLESS_ERROR_USER_NOT_AUTHENTICATED);
    }

    // Headless tasks must not call GET /v1/groups; build the fabric from groupId only.
    const fabric = new ESPRMNGFabric({
      groupId: taskData.groupId,
      groupName: "",
    });

    if (
      taskData.nocsrElements &&
      taskData.attestationChallenge &&
      taskData.attestationSignature
    ) {
      const response = await fabric.addNodeToMatterFabric({
        requestId: taskData.requestId,
        nocsrElements: taskData.nocsrElements,
        attestationChallenge: taskData.attestationChallenge,
        attestationSignature: taskData.attestationSignature,
      });

      const rmngNodeId = response.node_id || "";
      const matterNodeId = response.matter_node_id;
      if (rmngNodeId && matterNodeId) {
        try {
          await setMatterNodeId(rmngNodeId, matterNodeId);
          await setMatterMetadata(rmngNodeId, { deviceName: "Matter Device" });
        } catch (persistError) {
          console.warn(
            "[HeadlessJS] Failed to persist matter_node_id:",
            persistError,
          );
        }
      }

      const resultData = {
        success: true,
        requestId: taskData.requestId,
        nodeId: taskData.nodeId,
        noc: response.noc,
        matterNodeId,
        rmngNodeId,
      };

      if (ESPMatterModule?.handleHeadlessTaskResult) {
        ESPMatterModule.handleHeadlessTaskResult(
          HEADLESS_TASK_ISSUE_NOC,
          JSON.stringify(resultData),
        );
      } else {
        throw new Error(HEADLESS_ERROR_NATIVE_MODULE_UNAVAILABLE);
      }

      return resultData;
    }

    if (taskData.csr) {
      const response = await fabric.issueUserNoC(taskData.csr);
      const resultData = {
        success: true,
        requestId: taskData.requestId,
        nodeId: taskData.nodeId,
        noc: response.noc,
        matterNodeId: response.matter_user_id,
        rmngNodeId: "",
      };

      if (ESPMatterModule?.handleHeadlessTaskResult) {
        ESPMatterModule.handleHeadlessTaskResult(
          HEADLESS_TASK_ISSUE_NOC,
          JSON.stringify(resultData),
        );
      } else {
        throw new Error(HEADLESS_ERROR_NATIVE_MODULE_UNAVAILABLE);
      }

      return resultData;
    }

    throw new Error("Either attestation data or CSR is required");
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
    console.error("[HeadlessJS] rmngMatterIssueNocTask error:", message);

    const errorData = {
      success: false,
      requestId: taskData.requestId,
      nodeId: taskData.nodeId,
      error: message,
    };

    if (ESPMatterModule?.handleHeadlessTaskResult) {
      ESPMatterModule.handleHeadlessTaskResult(
        HEADLESS_TASK_ISSUE_NOC,
        JSON.stringify(errorData),
      );
    }

    throw error;
  }
}

const MATTER_NODE_ID_HEX_LEN = 16;

/**
 * Native sends EXTRA_NODE_ID as the decimal CHIP node id (Long.toString); the cloud group API
 * and the home sync (collectRmngNodesForGroup) key Matter nodes by the 16-char upper-hex RMNG
 * node id. Re-key so persisted metadata is found on read-back.
 */
function toRmngNodeKey(rawNodeId: string): string {
  const trimmed = rawNodeId.trim();
  if (!trimmed) return trimmed;
  if (/^[0-9]+$/.test(trimmed)) {
    try {
      return BigInt(trimmed)
        .toString(16)
        .toUpperCase()
        .padStart(MATTER_NODE_ID_HEX_LEN, "0");
    } catch {
      return trimmed.toUpperCase();
    }
  }
  return trimmed.toUpperCase().padStart(MATTER_NODE_ID_HEX_LEN, "0");
}

/**
 * Persist the device's Matter metadata (endpoints/clusters/deviceType) reported in the
 * confirm-commission payload. Pure-Matter nodes have no cloud `/config`, so the home device
 * card is rebuilt locally from this copy (collectRmngNodesForGroup → buildCdfNodesFromGroup →
 * loadPureMatterBuildContext → matterDataToEspMetadata). Without this, only the
 * `{ deviceName: "Matter Device" }` placeholder from issue-NoC is stored, `matter_data` is
 * absent, hasUsableMatterTopology() is false, and the commissioned node never renders a card.
 *
 * Native hands us the whole confirm body string —
 *   { req_id, status, metadata: { Matter: { deviceType, deviceName, endpoints } }, ... }
 * — so we unwrap `.metadata.Matter` and re-key to the hex RMNG node id.
 */
async function persistPureMatterMetadata(
  taskData: RmngConfirmCommissionTaskData,
): Promise<void> {
  if (!taskData.metadata || !taskData.nodeId) {
    return;
  }
  try {
    const parsed = JSON.parse(taskData.metadata) as Record<string, unknown>;
    const envelope = ((parsed.metadata as Record<string, unknown>) ??
      parsed) as Record<string, unknown>;
    const matterMeta = (envelope.Matter ?? envelope.matter ?? envelope) as
      | (Record<string, unknown> & {
          endpoints?: unknown;
          deviceName?: unknown;
          deviceType?: unknown;
        })
      | undefined;
    const nodeKey = toRmngNodeKey(taskData.nodeId);
    if (
      !matterMeta ||
      typeof matterMeta !== "object" ||
      !matterMeta.endpoints
    ) {
      return;
    }
    await setMatterMetadata(nodeKey, {
      matter_data: matterMeta,
      deviceName: matterMeta.deviceName,
      deviceType: matterMeta.deviceType,
    });
    console.log("[HeadlessJS][persistMeta] WROTE matter_data", {
      nodeKey,
      deviceName: matterMeta.deviceName,
    });
  } catch (persistError) {
    console.warn(
      "[HeadlessJS] Failed to persist pure-Matter metadata:",
      persistError,
    );
  }
}

export async function rmngMatterConfirmCommissionTask(
  taskData: RmngConfirmCommissionTaskData,
): Promise<Record<string, unknown>> {
  try {
    await initializeRmngMatterSDK();
    await preseedSigV4Credentials(taskData);

    if (!taskData.nodeId || !taskData.requestId || !taskData.groupId) {
      throw new Error(HEADLESS_ERROR_MISSING_TASK_DATA);
    }

    const authInstance = ESPRMNGBase.getAuthInstance();
    const user = await authInstance.getLoggedInUser();
    if (!user) {
      throw new Error(HEADLESS_ERROR_USER_NOT_AUTHENTICATED);
    }

    const fabric = new ESPRMNGFabric({ groupId: taskData.groupId, groupName: "" });
    const requestId = taskData.requestId;

    const maxRetries = 3;
    const retryDelayMs = 2000;
    let confirmResponse: unknown;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        confirmResponse = await fabric.confirmUserNodeMapping({
          requestId,
        });
        lastError = null;
        break;
      } catch (retryError) {
        lastError = retryError;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    await persistPureMatterMetadata(taskData);

    const resultData = {
      success: true,
      requestId,
      nodeId: taskData.nodeId,
      confirmNodeId: (confirmResponse as { node_id?: string })?.node_id || "",
      response: confirmResponse,
    };

    if (ESPMatterModule?.handleHeadlessTaskResult) {
      ESPMatterModule.handleHeadlessTaskResult(
        HEADLESS_TASK_CONFIRM_COMMISSION,
        JSON.stringify(resultData),
      );
    } else {
      throw new Error(HEADLESS_ERROR_NATIVE_MODULE_UNAVAILABLE);
    }

    return resultData;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
    console.error("[HeadlessJS] rmngMatterConfirmCommissionTask error:", message);

    const errorData = {
      success: false,
      requestId: taskData.requestId,
      nodeId: taskData.nodeId,
      error: message,
    };

    if (ESPMatterModule?.handleHeadlessTaskResult) {
      ESPMatterModule.handleHeadlessTaskResult(
        HEADLESS_TASK_CONFIRM_COMMISSION,
        JSON.stringify(errorData),
      );
    }

    throw error;
  }
}
