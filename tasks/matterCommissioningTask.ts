/**
 * Headless JS Tasks for Matter Commissioning
 *
 * Background tasks for backend API calls during Matter commissioning.
 * Note: Tasks queue while React Native host is paused (e.g., GPS UI showing).
 */

import { NativeModules } from "react-native";
import {
  ESPRMMatterCommissioningRequest,
  ESPRMBase,
  ESPRMMatterBase,
} from "@espressif/rainmaker-matter-sdk";
import { matterSDKConfig } from "@/rainmaker.config";
import {
  NODE_TYPE,
  MATTER_METADATA_KEY,
  HEADLESS_TASK_ISSUE_NOC,
  HEADLESS_TASK_CONFIRM_COMMISSION,
  STATUS_PENDING,
  STATUS_SUCCESS,
  METADATA_KEY_CHALLENGE,
  METADATA_KEY_CHALLENGE_RESPONSE,
  METADATA_KEY_CHALLENGE_RESPONSE_SNAKE,
  METADATA_KEY_IS_RAINMAKER_NODE,
  METADATA_KEY_RAINMAKER_NODE_ID,
  METADATA_KEY_MATTER_NODE_ID,
  HEADLESS_ERROR_MISSING_TASK_DATA,
  HEADLESS_ERROR_USER_NOT_AUTHENTICATED,
  HEADLESS_ERROR_UNKNOWN,
  HEADLESS_ERROR_NATIVE_MODULE_UNAVAILABLE,
  HEADLESS_COMMISSIONING_DESCRIPTION,
} from "@/utils/constants";

const { ESPMatterModule } = NativeModules;

let sdkInitialized = false;

/** Initialize SDK (required as headless tasks run in separate JS context). */
const initializeSDK = async () => {
  if (sdkInitialized) {
    return;
  }

  try {
    ESPRMMatterBase.configure(matterSDKConfig);
    sdkInitialized = true;
  } catch (error) {
    console.error("[HeadlessJS] Failed to initialize SDK:", error);
    throw error;
  }
};

/**
 * Task data interface for Issue NOC
 */
interface IssueNocTaskData {
  nodeId: string;
  csr: string;
  fabricId: string;
  groupId: string;
  requestId: string;
}

/**
 * Task data interface for Confirm Commission
 */
interface ConfirmCommissionTaskData {
  nodeId: string;
  fabricId: string;
  groupId: string;
  requestId: string;
  metadata: string;
  challenge?: string;
  challengeResponse?: string;
}

/** Issues Node Operational Certificate via backend API. Triggered when CSR is received from device. */
export const MatterIssueNocTask = async (taskData: IssueNocTaskData) => {
  try {
    await initializeSDK();

    if (
      !taskData.nodeId ||
      !taskData.csr ||
      !taskData.fabricId ||
      !taskData.requestId
    ) {
      throw new Error(HEADLESS_ERROR_MISSING_TASK_DATA);
    }

    const csr = taskData.csr;
    const groupId = taskData.groupId;

    // HeadlessJS runs in isolated context; app state/stores unavailable. Fetch from SDK storage.
    const authInstance = ESPRMBase.getAuthInstance();
    const user = await authInstance.getLoggedInUser();

    if (!user) {
      throw new Error(HEADLESS_ERROR_USER_NOT_AUTHENTICATED);
    }

    const fabric = await user.getFabricById({ id: groupId });

    if (!fabric) {
      throw new Error(`Fabric not found with groupId: ${groupId}`);
    }

    const commissioningRequest = await fabric.issueNodeNoC({
      csr,
      deviceId: taskData.nodeId,
    });

    return {
      success: true,
      requestId: commissioningRequest.requestId,
      nodeId: taskData.nodeId,
    };
  } catch (error: any) {
    console.error("[HeadlessJS] MatterIssueNocTask error:", error.message);

    const errorData = {
      success: false,
      requestId: taskData.requestId,
      nodeId: taskData.nodeId,
      error: error.message || HEADLESS_ERROR_UNKNOWN,
    };

    if (ESPMatterModule && ESPMatterModule.handleHeadlessTaskResult) {
      ESPMatterModule.handleHeadlessTaskResult(
        HEADLESS_TASK_ISSUE_NOC,
        JSON.stringify(errorData)
      );
    }

    throw error;
  }
};

/** Confirms commissioning via backend API. Triggered after device is successfully commissioned. */
export const MatterConfirmCommissionTask = async (
  taskData: ConfirmCommissionTaskData
) => {
  try {
    await initializeSDK();

    if (
      !taskData.nodeId ||
      !taskData.fabricId ||
      !taskData.requestId ||
      !taskData.metadata
    ) {
      throw new Error(HEADLESS_ERROR_MISSING_TASK_DATA);
    }

    const groupId = taskData.groupId;
    const requestId = taskData.requestId;
    const metadata = JSON.parse(taskData.metadata);

    // Handle both camelCase (JS) and snake_case (native) formats
    const challenge =
      taskData.challenge || metadata[METADATA_KEY_CHALLENGE] || "";
    const challengeResponse =
      taskData.challengeResponse ||
      metadata[METADATA_KEY_CHALLENGE_RESPONSE] ||
      metadata[METADATA_KEY_CHALLENGE_RESPONSE_SNAKE] ||
      "";

    // Expected structure: { metadata: { Matter: { is_rainmaker_node, ... } }, rainmaker_node_id, ... }
    const matterData =
      metadata.metadata?.[MATTER_METADATA_KEY] ||
      metadata[MATTER_METADATA_KEY] ||
      {};

    const isRainmakerNode =
      matterData[METADATA_KEY_IS_RAINMAKER_NODE] === true ||
      matterData[METADATA_KEY_IS_RAINMAKER_NODE] === "true" ||
      Boolean(metadata[METADATA_KEY_RAINMAKER_NODE_ID]);

    const rainmakerNodeId =
      metadata[METADATA_KEY_RAINMAKER_NODE_ID] ||
      matterData[METADATA_KEY_RAINMAKER_NODE_ID] ||
      (isRainmakerNode ? taskData.nodeId : "");

    const matterNodeId =
      matterData[METADATA_KEY_MATTER_NODE_ID] || taskData.nodeId;

    const nodeType = isRainmakerNode
      ? NODE_TYPE.RAINMAKER_MATTER
      : NODE_TYPE.PURE_MATTER;

    const commissioningRequest = new ESPRMMatterCommissioningRequest({
      requestId: requestId,
      groupId: groupId,
      status: STATUS_PENDING,
      description: HEADLESS_COMMISSIONING_DESCRIPTION,
    });

    const confirmResponse =
      await commissioningRequest.confirmMatterNodeCommissioning({
        nodeType: nodeType as any,
        status: STATUS_SUCCESS,
        rainmakerNodeId: rainmakerNodeId,
        matterNodeId: matterNodeId,
        challengeResponse: challengeResponse,
        challenge: challenge,
        metadata: metadata,
      });

    const resultData = {
      success: true,
      requestId: requestId,
      nodeId: taskData.nodeId,
      response: confirmResponse,
    };

    if (ESPMatterModule && ESPMatterModule.handleHeadlessTaskResult) {
      ESPMatterModule.handleHeadlessTaskResult(
        HEADLESS_TASK_CONFIRM_COMMISSION,
        JSON.stringify(resultData)
      );
    } else {
      throw new Error(HEADLESS_ERROR_NATIVE_MODULE_UNAVAILABLE);
    }

    return resultData;
  } catch (error: any) {
    console.error(
      "[HeadlessJS] MatterConfirmCommissionTask error:",
      error.message
    );

    const errorData = {
      success: false,
      requestId: taskData.requestId,
      nodeId: taskData.nodeId,
      error: error.message || HEADLESS_ERROR_UNKNOWN,
    };

    if (ESPMatterModule && ESPMatterModule.handleHeadlessTaskResult) {
      ESPMatterModule.handleHeadlessTaskResult(
        HEADLESS_TASK_CONFIRM_COMMISSION,
        JSON.stringify(errorData)
      );
    }

    throw error;
  }
};

