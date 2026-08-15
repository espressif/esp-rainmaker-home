/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProvisionStatus } from "@src/types/global";
import {
  ESPCDFOnNetworkProgressMessages,
  ESPCDFProvProgressMessages,
} from "@store";
import {
  PROVISION_NODE_ONLINE_TIMEOUT_ERROR,
  PROVISION_SETUP_PROGRESS_MESSAGES,
  SDK_ERROR_DESC_NODES_DO_NOT_EXIST,
  SDK_ERROR_CODE_NODES_DO_NOT_EXIST,
  SDK_NODE_ONLINE_TIMEOUT_ERROR,
  SDK_NO_PROVISION_STATE_TO_RESUME_ERROR,
} from "@shared/utils/constants";
import { CHAL_RESP_PROGRESS_MESSAGES } from "@features/provision/constants";

/** Technical setup-progress descriptions emitted by RMNeo `provisionHelpers`. */
const PROVISION_SETUP_PROGRESS_VALUES: readonly string[] = Object.values(
  PROVISION_SETUP_PROGRESS_MESSAGES,
);

/**
 * Returns true when `message` is a post-provision setup progress key
 * (checking online / MQTT reconnect / timezone / complete).
 * @param message - Progress `description` from an ON_PROGRESS callback.
 * @returns Whether the message should update the setting-up stage detail.
 */
export const isProvisionSetupProgressMessage = (message: string): boolean =>
  PROVISION_SETUP_PROGRESS_VALUES.includes(message);

export type StageStatus = "pending" | "success" | "error";

export interface ProvisionStage {
  id: number;
  title: string;
  status: StageStatus;
  description: string;
  error?: string;
}

/**
 * Map stage status to provision status
 */
export const mapStageStatusToProvisionStatus = (
  status: StageStatus
): ProvisionStatus => {
  switch (status) {
    case "pending":
      return "progress";
    case "success":
      return "succeed";
    case "error":
      return "failed";
    default:
      return "progress";
  }
};

/**
 * Get provision stages configuration
 */
export const getProvisionStages = (t: any): ProvisionStage[] => [
  {
    id: 1,
    title: t("device.provision.sendingCredentialsTitle"),
    status: "pending",
    description: t("device.provision.sendingCredentialsDescription"),
  },
  {
    id: 2,
    title: t("device.provision.confirmingConnectionTitle"),
    status: "pending",
    description: t("device.provision.confirmingConnectionDescription"),
  },
  {
    id: 3,
    title: t("device.provision.configuringDeviceAssociationTitle"),
    status: "pending",
    description: t("device.provision.configuringDeviceAssociationDescription"),
  },
  {
    id: 4,
    title: t("device.provision.verifyingDeviceAssociation"),
    status: "pending",
    description: t("device.provision.verifyingDeviceAssociation"),
  },
  {
    id: 5,
    title: t("device.provision.settingUpNode"),
    status: "pending",
    description: t("device.provision.settingUpNodeDescription"),
  },
];

/**
 * Get challenge-response flow stages configuration
 */
export const getChallengeResponseStages = (t: any): ProvisionStage[] => [
  {
    id: 1,
    title: t("device.provision.challengeResponse.confirmingNodeAssociationTitle"),
    status: "pending",
    description: t("device.provision.challengeResponse.confirmingNodeAssociationDescription"),
  },
  {
    id: 2,
    title: t("device.provision.challengeResponse.confirmingWifiConnectionTitle"),
    status: "pending",
    description: t("device.provision.challengeResponse.confirmingWifiConnectionDescription"),
  },
  {
    id: 3,
    title: t("device.provision.challengeResponse.settingUpNodeTitle"),
    status: "pending",
    description: t("device.provision.challengeResponse.settingUpNodeDescription"),
  },
];

/**
 * Stages displayed during the on-network (LAN HTTP) provisioning flow.
 *
 * The device is already on the user's Wi-Fi, so we omit the Wi-Fi credential
 * and Wi-Fi connection confirmation steps. Mirrors what the iOS / Android
 * native apps surface for the same flow.
 */
export const getOnNetworkProvisionStages = (t: any): ProvisionStage[] => [
  {
    id: 1,
    title: t("device.provision.onNetwork.confirmingNodeAssociationTitle"),
    status: "pending",
    description: t(
      "device.provision.onNetwork.confirmingNodeAssociationDescription"
    ),
  },
  {
    id: 2,
    title: t("device.provision.onNetwork.settingUpNodeTitle"),
    status: "pending",
    description: t("device.provision.onNetwork.settingUpNodeDescription"),
  },
];

/**
 * Maps on-network progress messages (from the SDK adaptor) to UI stage ids.
 *
 * Stage 2 (`Setting up the Node`) is marked complete by `handleAddDeviceSuccess`
 * once the cloud-side `addOnNetworkDevice` call returns a fetched node and the
 * Continue button becomes enabled — same convention as the challenge-response
 * flow.
 */
export const ON_NETWORK_MESSAGE_STAGE_MAP: Record<string, number> = {
  [ESPCDFOnNetworkProgressMessages.INITIATING_NODE_ASSOCIATION]: 1,
  [ESPCDFOnNetworkProgressMessages.SENDING_CHALLENGE_TO_DEVICE]: 1,
  [ESPCDFOnNetworkProgressMessages.VERIFYING_NODE_ASSOCIATION]: 1,
  [ESPCDFOnNetworkProgressMessages.USER_NODE_MAPPING_SUCCEED]: 1,
};

/**
 * Message to stage mapping for traditional MQTT association flow.
 * Each message means that UI stage is complete (same pattern as native apps).
 */
export const MESSAGE_STAGE_MAP: Record<string, number> = {
  [ESPCDFProvProgressMessages.DECODED_NODE_ID]: 1,
  [ESPCDFProvProgressMessages.DEVICE_PROVISIONED]: 2,
  [ESPCDFProvProgressMessages.USER_NODE_MAPPING_SUCCEED]: 4,
  [ESPCDFProvProgressMessages.NODE_TIMEZONE_SETUP_SUCCEED]: 5,
};

/**
 * Challenge-response (BLE / SoftAP) progress → UI stage completion.
 *
 * Mirrors MQTT `MESSAGE_STAGE_MAP`: only map milestones that mean a stage
 * finished — not the in-progress strings that fire at the start of a step.
 *
 * | SDK progress | UI stage completed |
 * |---|---|
 * | SETTING_NETWORK_CREDENTIALS | 1 — cloud mapping verified; Wi-Fi about to apply |
 * | WAITING_FOR_ONLINE (RainMaker Neo) | 2 — credentials applied; waiting for cloud online |
 *
 * Stage 2 also completes on `SUCCEED` (nodeId / DEVICE_PROVISIONED) in
 * `useProvision` when WAITING_FOR_ONLINE is not emitted (RM base SDK).
 * Stage 3 completes in `handleAddDeviceSuccess` (same as MQTT final step).
 *
 * INITIATING / SENDING / VERIFYING keep stage 1 pending (spinner) until
 * association is confirmed.
 */
export const CHAL_RESP_MESSAGE_STAGE_MAP: Record<string, number> = {
  [CHAL_RESP_PROGRESS_MESSAGES.SETTING_NETWORK_CREDENTIALS]: 1,
  [CHAL_RESP_PROGRESS_MESSAGES.WAITING_FOR_ONLINE]: 2,
};

/** Chal-resp UI stage id for successful Wi-Fi / device provision (SUCCEED). */
export const CHAL_RESP_WIFI_STAGE_ID = 2;

/** Re-export for backward compatibility */
export { extractErrorMessage } from "@shared/utils/common";

/** Android code / iOS description fragments meaning rejected Wi-Fi credentials. */
const WIFI_AUTH_FAILURE_SIGNATURES = ["auth_failed", "authentication error"];

/** Whether the Wi-Fi password was rejected; matched raw so it holds in every language. */
export const isWifiAuthFailure = (rawError: string): boolean => {
  const normalized = rawError.toLowerCase();
  return WIFI_AUTH_FAILURE_SIGNATURES.some((sig) => normalized.includes(sig));
};

/**
 * Get localized error message from raw error
 */
export const getLocalizedErrorMessage = (
  rawError: string,
  t: (key: string, params?: any) => string
): string => {
  const normalizedError = rawError.toLowerCase();

  // Android / app / SDK error codes (exact match on extracted string)
  const androidErrorMap: Record<string, string> = {
    AUTH_FAILED: t("device.errors.wifiAuthFailed"),
    NETWORK_NOT_FOUND: t("device.errors.networkNotFound"),
    DEVICE_DISCONNECTED: t("device.errors.deviceDisconnected"),
    [PROVISION_NODE_ONLINE_TIMEOUT_ERROR]: t("device.errors.nodeOnlineTimeout"),
    [SDK_NODE_ONLINE_TIMEOUT_ERROR]: t("device.errors.nodeOnlineTimeout"),
    [SDK_NO_PROVISION_STATE_TO_RESUME_ERROR]: t(
      "device.errors.noProvisionStateToResume",
    ),
    [SDK_ERROR_CODE_NODES_DO_NOT_EXIST]: t(
      "device.errors.nodeDoesNotExist",
    ),
    [SDK_ERROR_DESC_NODES_DO_NOT_EXIST]: t(
      "device.errors.nodeDoesNotExist",
    ),
  };

  if (androidErrorMap[rawError]) {
    return androidErrorMap[rawError];
  }

  // iOS ESPProvisionError / Neo online-wait / SDK descriptions
  const iosErrorPatterns: { keywords: string[]; message: string }[] = [
    {
      keywords: [
        SDK_ERROR_DESC_NODES_DO_NOT_EXIST.toLowerCase(),
        SDK_ERROR_CODE_NODES_DO_NOT_EXIST,
      ],
      message: t("device.errors.nodeDoesNotExist"),
    },
    {
      keywords: [
        "node online",
        "node_online_timeout",
        "provision_node_online_timeout",
        "timed out waiting for node",
      ],
      message: t("device.errors.nodeOnlineTimeout"),
    },
    {
      keywords: ["wi-fi status: authentication error", "authentication error"],
      message: t("device.errors.wifiAuthFailed"),
    },
    {
      keywords: ["wi-fi status: network not found", "network not found"],
      message: t("device.errors.networkNotFound"),
    },
    {
      keywords: ["wi-fi status: disconnected"],
      message: t("device.errors.deviceDisconnected"),
    },
    {
      keywords: ["wi-fi status: unknown error"],
      message: t("device.errors.wifiStatusUnknown"),
    },
    {
      keywords: ["session is not established", "error while initialising session"],
      message: t("device.errors.sessionFailed"),
    },
    {
      keywords: ["failed to apply network configuration"],
      message: t("device.errors.configurationFailed"),
    },
    {
      keywords: ["unable to fetch wifi status"],
      message: t("device.errors.wifiStatusFetchFailed"),
    },
  ];

  for (const pattern of iosErrorPatterns) {
    if (pattern.keywords.some((keyword) => normalizedError.includes(keyword))) {
      return pattern.message;
    }
  }

  // Filter out generic error codes that aren't user-friendly
  const genericCodes = ["provisioning_failed", "error", "unknown error"];
  if (genericCodes.includes(normalizedError)) {
    return t("device.errors.provisioningFailed");
  }

  // Return the original message if it's descriptive enough
  return rawError;
};
