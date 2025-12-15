/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import {
  ESPDevice,
  ESPProvResponse,
  ESPProvResponseStatus,
  ESPProvProgressMessages,
  ESPRMNode,
  ESPRMServiceParam,
} from "@espressif/rainmaker-base-sdk";

// Hooks
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";

// Icons
import { Check, X, Circle } from "lucide-react-native";

// Components
import { Header, ScreenWrapper, Button } from "@/components";

// Utils
import { testProps } from "@/utils/testProps";
import { useToast } from "@/hooks/useToast";
import {
  ESPRM_AGENT_AUTH_SERVICE,
  ESPRM_REFRESH_TOKEN_PARAM_TYPE,
  POLLING,
} from "@/utils/constants";
import { setUserAuthForNode } from "@/utils/agent/device";
import { TOKEN_STORAGE_KEYS } from "@/utils/agent";
import { ChallengeResponseHelper } from "@/utils/challengeResponseHelper";
import { getUserTimeZone, setNodeTimeZone } from "@/utils/timezone";
import { pollUntilReady } from "@/utils/common";

// Types
import { ProvisionStatus } from "@/types/global";

// Storage
import AsyncStorage from "@react-native-async-storage/async-storage";

type StageStatus = "pending" | "success" | "error";

interface ProvisionStage {
  id: number;
  title: string;
  status: StageStatus;
  description: string;
  error?: string;
}

interface ProvisioningStepProps {
  description: string;
  status: ProvisionStatus;
  error?: string;
}

// Map our status to ProvisionStatus
const mapStageStatusToProvisionStatus = (
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

// Fixed stages configuration - will be localized in component
const getProvisionStages = (t: any): ProvisionStage[] => [
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

// Challenge-response flow stages configuration
const getChallengeResponseStages = (t: any): ProvisionStage[] => [
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

// Message to stage mapping
// Stage 1: Sending Wi-Fi credential - Complete on DECODED_NODE_ID
// Stage 2: Confirming Wi-Fi credential - Complete on DEVICE_PROVISIONED
// Stage 3: Configuring user-node association - Complete with delay after stage 2
// Stage 4: Confirming user-node association - Complete on USER_NODE_MAPPING_SUCCEED
// Stage 5: Setting Up Node - Complete on NODE_TIMEZONE_SETUP_SUCCEED
const MESSAGE_STAGE_MAP: Record<string, number> = {
  [ESPProvProgressMessages.DECODED_NODE_ID]: 1,
  [ESPProvProgressMessages.DEVICE_PROVISIONED]: 2,
  [ESPProvProgressMessages.USER_NODE_MAPPING_SUCCEED]: 4,
  [ESPProvProgressMessages.NODE_TIMEZONE_SETUP_SUCCEED]: 5,
};

/**
 * Renders a single provisioning step with status indicator
 * @returns JSX component
 */
const ProvisioningStep: React.FC<ProvisioningStepProps> = ({
  description,
  status,
  error,
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case "progress":
        return <ActivityIndicator {...testProps("activity_indicator_in_progress_provision")} size="small" color={tokens.colors.primary} />;
      case "succeed":
        return <Check {...testProps("icon_succeed_provision")} size={24} color={tokens.colors.green} />;
      case "failed":
        return <X {...testProps("icon_failed_provision")} size={24} color={tokens.colors.red} />;
      default:
        return <Circle {...testProps("icon_pending_provision")} size={24} color={tokens.colors.gray} />;
    }
  };

  return (
    <View
      {...testProps("view_status_provision")}
      style={[styles.stepContainer, { backgroundColor: tokens.colors.bg5 }]}
    >
      {getStatusIcon()}
      <View {...testProps("view_content_provision")} style={styles.stepContent}>
        <Text {...testProps("text_description_provision")} style={styles.stepDescription}>{description}</Text>
        {error && status === "failed" && (
          <Text {...testProps("text_error_provision")} style={styles.stepError}>{error}</Text>
        )}
      </View>
    </View>
  );
};

/**
 * Provision
 *
 * Main component for handling device provisioning process
 * Shows progress steps and handles Node provisioning steps
 * @returns JSX component
 */
const Provision = () => {
  // Hooks
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();
  const { store } = useCDF();
  // State
  const [stages, setStages] = useState<ProvisionStage[]>(() =>
    getProvisionStages(t)
  );
  const [isComplete, setIsComplete] = useState(false);
  // Refs
  const stepsScrollViewRef = useRef<ScrollView>(null);
  const stagesRef = useRef<ProvisionStage[]>(stages);
  const isChallengeResponseFlowRef = useRef(false);
  const decodedNodeIdRef = useRef<string | null>(null);

  // Params & Data
  const { ssid, password } = useLocalSearchParams();
  const device: ESPDevice = store.nodeStore.connectedDevice;
  const currentHomeId = store.groupStore.currentHomeId;

  // Effects
  useEffect(() => {
    if (ssid && device) {
      startProvisioning();
    }
  }, [ssid, password, device]);

  // Handlers
  /**
   * Scrolls to the bottom of the steps list
   */
  const scrollToBottom = () => {
    setTimeout(() => {
      stepsScrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  /**
   * Sets up timezone for the provisioned node
   * Replicates the logic from NodeTimeZoneSetupService in the SDK
   */
  const setupNodeTimeZone = async (nodeId: string) => {
    try {
      const provisionedNode: ESPRMNode | undefined = store.nodeStore.nodesByID[nodeId] as ESPRMNode | undefined;
      if (!provisionedNode) {
        return;
      }

      // Step 1: Get user's timezone from custom data
      const userTimeZone = await getUserTimeZone(store.userStore.user);
      if (!userTimeZone) {
        return;
      }

      // Step 2: Set node timezone
      await setNodeTimeZone(provisionedNode, userTimeZone);
    } catch (error) {
      console.error("Error setting up node timezone:", error);
      // Don't throw - timezone setup is not critical for provisioning
    }
  };


  /**
   * Sets refresh token for the provisioned node if it's an AI agent device
   */
  const setRefreshTokenForNode = async (node: ESPRMNode) => {
    try {
      // Find the agent-auth service
      const agentAuthService = node?.nodeConfig?.services?.find(
        (service) => service.type === ESPRM_AGENT_AUTH_SERVICE
      );

      if (!agentAuthService) {
        // Not an AI agent device, skip
        return;
      }

      // Find the refresh-token parameter
      const refreshTokenParam: ESPRMServiceParam | undefined =
        agentAuthService.params?.find(
          (param) => param.type === ESPRM_REFRESH_TOKEN_PARAM_TYPE
        );

      if (!refreshTokenParam) {
        return;
      }

      const refreshToken = await AsyncStorage.getItem(
        TOKEN_STORAGE_KEYS.REFRESH_TOKEN
      );

      if (!refreshToken) {
        return;
      }

      // Update the refresh-token parameter to trigger refresh
      await node?.setMultipleParams({
        [agentAuthService.name]: [
          {
            [refreshTokenParam.name]: refreshToken,
          },
        ],
      });

    } catch (error) {
      console.error("Error setting refresh token for provisioned node:", error);
      // Don't throw error, just log it as this is not critical for provisioning success
    }
  };

  /**
   * Handle successful provisioning completion
   */
  const handleProvisionSuccess = async () => {
    try {
      if (!decodedNodeIdRef.current) {
        setIsComplete(true);
        toast.showSuccess(t("device.provision.success"));
        return;
      }

      const nodeId = decodedNodeIdRef.current;

      // Step 1: First refresh the group to get updated node list
      if (currentHomeId) {
        await store.userStore.user?.getGroupById({
          id: currentHomeId as string,
          withNodeList: true,
          withSubGroups: true,
        });
      }

      // Step 2: Try to get node from store after group refresh
      let provisionedNode: ESPRMNode | undefined = store.nodeStore.nodesByID[nodeId] as ESPRMNode | undefined;

      // Step 3: If node still not found in group store, fetch it by syncing node list
      if (!provisionedNode) {
        try {
          await store.nodeStore.syncNodeList();
          
          // Try again after sync
          provisionedNode = store.nodeStore.nodesByID[nodeId] as ESPRMNode | undefined;
        } catch (syncError) {
          console.error("Failed to sync node list:", syncError);
        }
      }

      // Step 4: If node is found, set refresh token and add to group
      if (provisionedNode) {
        // Check if this is an AI agent device
        const agentAuthService = provisionedNode?.nodeConfig?.services?.find(
          (service) => service.type === ESPRM_AGENT_AUTH_SERVICE
        );
        const isAgentDevice = !!agentAuthService;

        // Set refresh token for AI agent device (enable continue button regardless of success/failure)
        if (isAgentDevice) {
          try {
            await setRefreshTokenForNode(provisionedNode);
            // Also set user auth (access token and base URL) if service is available
            await setUserAuthForNode(provisionedNode);
            // Enable continue button after token setting attempt (regardless of success/failure)
            setIsComplete(true);
            toast.showSuccess(t("device.provision.success"));
          } catch (tokenError) {
            console.error("Error setting refresh token (non-blocking):", tokenError);
            // Enable continue button even if token setting failed
            setIsComplete(true);
            toast.showSuccess(t("device.provision.success"));
          }
        } else {
          // For non-agent devices, set user auth if service is available
          // Wait for completion before enabling continue button
          try {
            await setUserAuthForNode(provisionedNode);
            // Enable continue button after user auth service settings complete
            setIsComplete(true);
            toast.showSuccess(t("device.provision.success"));
          } catch (userAuthError) {
            console.error("Error setting user auth (non-blocking):", userAuthError);
            // Enable continue button anyway - don't block provisioning flow
            setIsComplete(true);
            toast.showSuccess(t("device.provision.success"));
          }
        }

        // Step 5: Add node to current group if not already in it
        // Note: Continue button is already enabled above for both agent and non-agent devices
        if (currentHomeId) {
          const currentGroup = store.groupStore._groupsByID[currentHomeId];
          const isNodeInGroup = currentGroup?.nodes?.includes(nodeId);

          if (isNodeInGroup) {
            // Continue button is already enabled after service settings
          } else if (currentGroup) {
            try {
              await currentGroup.addNodes([nodeId]);
              // Continue button is already enabled after service settings
            } catch (addError) {
              console.error("Failed to add node to current group:", addError);
              toast.showError(t("device.errors.failedToAddNodeToGroup") || "Failed to add device to home");
              // Continue button is already enabled after service settings
            }
          }
        }
      } else {
        toast.showError(t("device.errors.nodeNotFound") || "Device not found after provisioning");
        // Don't enable continue button if node not found
      }
    } catch (error) {
      console.error("Error handling provision success:", error);
      toast.showError(t("device.errors.provisioningFailed") || "Failed to complete provisioning");
      // Don't enable continue button on error
    }
  };

  /**
   * Marks the current stage and all subsequent stages as error
   * Sets error message only on the first (current) stage
   */
  const markStagesAsError = (
    stages: ProvisionStage[],
    stageId: number,
    errorMessage?: string
  ): void => {
    for (let i = stageId - 1; i < stages.length; i++) {
      const stage = stages[i];
      if (stage) {
        stage.status = "error";
        stage.error = i === stageId - 1 ? (errorMessage || "An error occurred") : undefined;
      }
    }
  };

  /**
   * Updates the stage status for challenge-response flow
   */
  const updateChallengeResponseStage = (stageId: number, isError?: boolean, errorMessage?: string) => {
    setStages((prevStages) => {
      const newStages = [...prevStages];

      if (isError) {
        markStagesAsError(newStages, stageId, errorMessage);
      } else {
        // Update current stage to success
        const currentStage = newStages[stageId - 1];
        if (currentStage) {
          currentStage.status = "success";
          currentStage.error = undefined;
        }

        // Set next stage to pending if exists
        if (stageId < 3) {
          const nextStage = newStages[stageId];
          if (nextStage) {
            nextStage.status = "pending";
          }
        }
      }

      stagesRef.current = newStages;
      return newStages;
    });

    scrollToBottom();
  };

  /**
   * Updates the stage status based on the provisioning message
   */
  const updateStageStatus = (message: string, isError?: boolean, errorMessage?: string) => {
    const stageId = MESSAGE_STAGE_MAP[message];

    if (!stageId) return;

    setStages((prevStages) => {
      const newStages = [...prevStages];

      if (isError) {
        markStagesAsError(newStages, stageId, errorMessage || message);
      } else {
        // Update current stage to success
        const currentStage = newStages[stageId - 1];
        if (currentStage) {
          currentStage.status = "success";
          currentStage.error = undefined;
        }

        // Set next stage to pending if exists
        if (stageId < 5) {
          const nextStage = newStages[stageId];
          if (nextStage) {
            nextStage.status = "pending";
          }
        }
      }

      stagesRef.current = newStages;
      return newStages;
    });

    scrollToBottom();
  };

  /**
   * Marks stage 3 (Configuring user-node association) as complete after a delay
   * This is called after DEVICE_PROVISIONED since the SDK doesn't emit a specific message
   * for when addNodeMapping API call completes
   */
  const markStage3AsComplete = () => {
    setTimeout(() => {
      setStages((prevStages) => {
        const newStages = [...prevStages];
        const stage3 = newStages[2];
        if (stage3) {
          stage3.status = "success";
          stage3.error = undefined;
        }
        const stage4 = newStages[3];
        if (stage4) {
          stage4.status = "pending";
        }
        stagesRef.current = newStages;
        return newStages;
      });
      scrollToBottom();
    }, 2000);
  };

  /**
   * Handles provisioning updates and updates stages accordingly
   * 
   * SDK Flow (from ESPDevice.provision):
   * 1. onProgress: START_ASSOCIATION
   * 2. onProgress: ASSOCIATION_CONFIG_CREATED
   * 3. onProgress: SENDING_ASSOCIATION_CONFIG
   * 4. onProgress: ASSOCIATION_CONFIG_SENT
   * 5. onProgress: DECODING_RESPONSE_DATA
   * 6. onProgress: DECODED_NODE_ID (with nodeId in data) → Stage 1 complete
   * 7. succeed: DEVICE_PROVISIONED → Stage 2 complete, Stage 3 complete (with delay)
   * 8. succeed: USER_NODE_MAPPING_SUCCEED → Stage 4 complete
   * 9. onProgress: INITIATING_NODE_TIMEZONE_SETUP
   * 10. onProgress: SETTING_NODE_TIMEZONE → Stage 5 complete (with delay, workaround for SDK bug)
   * 11. succeed: NODE_TIMEZONE_SETUP_SUCCEED → Stage 5 complete (backup, has SDK parsing bug)
   */
  const handleProvisionUpdate = async (response: ESPProvResponse) => {
    const message = response.description || "";
    const data = response.data || {};

    switch (response.status) {
      case ESPProvResponseStatus.succeed:
        if (message === ESPProvProgressMessages.DEVICE_PROVISIONED) {
          // Stage 2: Confirming Wi-Fi connection - Complete
          updateStageStatus(message);
          // Stage 3: Configuring user-node association - Complete with delay
          // (SDK calls addNodeMapping API after this, but doesn't emit a specific message)
          markStage3AsComplete();
        } else if (message === ESPProvProgressMessages.USER_NODE_MAPPING_SUCCEED) {
          // Stage 4: Verifying user-node association - Complete
          updateStageStatus(message);
        } else if (message === ESPProvProgressMessages.NODE_TIMEZONE_SETUP_SUCCEED) {
          // Stage 5: Setting Up Node - Complete
          updateStageStatus(message);
          handleProvisionSuccess();
        }
        break;

      case ESPProvResponseStatus.onProgress:
        if (message === ESPProvProgressMessages.DECODED_NODE_ID) {
          // Store node ID for later use
          const { nodeId } = data;
          decodedNodeIdRef.current = nodeId;
          // Stage 1: Sending Wi-Fi credentials - Complete
          updateStageStatus(message);
        } else if (message === ESPProvProgressMessages.SETTING_NODE_TIMEZONE) {
          // Stage 5: Setting Up Node - Complete after delay
          // Note: Using SETTING_NODE_TIMEZONE instead of NODE_TIMEZONE_SETUP_SUCCEED
          // due to SDK parsing bug with the success message
          setTimeout(() => {
            setStages((prevStages) => {
              const newStages = [...prevStages];
              // Mark Stage 5 (index 4) as success
              const stage5 = newStages[4];
              if (stage5) {
                stage5.status = "success";
                stage5.error = undefined;
              }
              stagesRef.current = newStages;
              return newStages;
            });
            scrollToBottom();
            handleProvisionSuccess();
          }, 2000); // 2 second delay to allow timezone setup to complete
        }
        // Other onProgress messages (START_ASSOCIATION, ASSOCIATION_CONFIG_SENT, etc.)
        // are informational and don't need to update stages
        break;

      default:
        // Handle any other status as error
        handleProvisionError(new Error(message));
        updateStageStatus(message, true, message);
        break;
    }
  };

  /**
   * Extracts the error message from various error formats
   * Android: { message: "AUTH_FAILED", code: "PROVISIONING_FAILED" }
   * iOS: { message: "Authentication failed description", code: "error" }
   */
  const extractErrorMessage = (error: any): string => {
    if (typeof error === "string") {
      return error;
    }

    if (error?.message) {
      return error.message;
    }

    if (error?.toString) {
      return error.toString().replace("Error: ", "");
    }

    return error?.code || "Unknown error";
  };

  /**
   * Maps error codes/messages to user-friendly localized messages
   * Handles both Android error codes and iOS ESPProvisionError descriptions
   */
  const getLocalizedErrorMessage = (rawError: string): string => {
    const normalizedError = rawError.toLowerCase();

    // Android error codes (uppercase constants)
    const androidErrorMap: Record<string, string> = {
      AUTH_FAILED: t("device.errors.wifiAuthFailed") || "Wi-Fi Authentication failed.",
      NETWORK_NOT_FOUND: t("device.errors.networkNotFound") || "Network not found. Please check the network name.",
      DEVICE_DISCONNECTED: t("device.errors.deviceDisconnected") || "Device disconnected. Please try again.",
    };

    if (androidErrorMap[rawError]) {
      return androidErrorMap[rawError];
    }

    // iOS ESPProvisionError descriptions (case-insensitive keyword matching)
    // Based on ESPProvisionError enum from ESPProvision library
    const iosErrorPatterns: Array<{ keywords: string[]; message: string }> = [
      // Wi-Fi authentication error
      // iOS: "Wi-Fi status: authentication error"
      {
        keywords: ["wi-fi status: authentication error", "authentication error"],
        message: t("device.errors.wifiAuthFailed") || "Wi-Fi Authentication failed.",
      },
      // Wi-Fi network not found
      // iOS: "Wi-Fi status: network not found"
      {
        keywords: ["wi-fi status: network not found", "network not found"],
        message: t("device.errors.networkNotFound") || "Network not found. Please check the network name.",
      },
      // Wi-Fi disconnected
      // iOS: "Wi-Fi status: disconnected"
      {
        keywords: ["wi-fi status: disconnected"],
        message: t("device.errors.deviceDisconnected") || "Device disconnected. Please try again.",
      },
      // Wi-Fi unknown error
      // iOS: "Wi-Fi status: unknown error"
      {
        keywords: ["wi-fi status: unknown error"],
        message: t("device.errors.wifiStatusUnknown") || "Wi-Fi status unknown. Please try again.",
      },
      // Session error
      // iOS: "Session is not established or error while initialising session. Connect device again to retry"
      {
        keywords: ["session is not established", "error while initialising session"],
        message: t("device.errors.sessionFailed") || "Session initialization failed. Please try again.",
      },
      // Configuration error
      // iOS: "Failed to apply network configuration to device with error: ..."
      {
        keywords: ["failed to apply network configuration"],
        message: t("device.errors.configurationFailed") || "Failed to apply network configuration. Please try again.",
      },
      // Wi-Fi status fetch error
      // iOS: "Unable to fetch wifi status with error: ..."
      {
        keywords: ["unable to fetch wifi status"],
        message: t("device.errors.wifiStatusFetchFailed") || "Unable to fetch Wi-Fi status. Please try again.",
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
      return t("device.errors.provisioningFailed") || "Provisioning failed";
    }

    // Return the original message if it's descriptive enough
    return rawError;
  };

  /**
   * Updates the UI to show error state for the current provisioning stage
   */
  const markCurrentStageAsError = (errorMessage: string) => {
    const currentStages = stagesRef.current;
    const loadingStageIndex = currentStages.findIndex(
      (stage) => stage.status === "pending"
    );

    if (loadingStageIndex < 0) return;

    if (isChallengeResponseFlowRef.current) {
      updateChallengeResponseStage(loadingStageIndex + 1, true, errorMessage);
    } else {
      updateStageStatus(
        Object.keys(MESSAGE_STAGE_MAP)[loadingStageIndex],
        true,
        errorMessage
      );
    }
  };

  /**
   * Handles provisioning error for both Android and iOS platforms
   * Android returns error codes (e.g., "AUTH_FAILED")
   * iOS returns error description strings (e.g., "Authentication failed")
   */
  const handleProvisionError = (error: any) => {
    console.error("Provision error:", error);

    const rawErrorMessage = extractErrorMessage(error);

    const localizedMessage = getLocalizedErrorMessage(rawErrorMessage);

    markCurrentStageAsError(localizedMessage);
    setIsComplete(true);
  };

  /**
   * Performs challenge-response provisioning flow
   * This flow:
   * 1. Does challenge-response authentication
   * 2. Calls setNetworkCredentials() directly (not provision())
   * 3. Manually fetches nodes and completes provisioning
   */
  const performChallengeResponseProvisioning = async () => {
    try {
      updateChallengeResponseStage(1, false);

      // Step 1: Get challenge from server
      const mappingResponse = await device?.initiateUserNodeMapping({});

      if (!mappingResponse) {
        throw new Error(t("error.challengeResponse.initiateUserNodeMappingFailed"));
      }

      const { challenge, request_id } = mappingResponse;

      if (!challenge || !request_id) {
        throw new Error(
          t("error.challengeResponse.invalidMappingResponse")
        );
      }

      // Step 2: Send challenge to device using protocol buffers
      const deviceResponse = await ChallengeResponseHelper.sendChallengeToDevice(
        device,
        challenge
      );

      if (!deviceResponse.success) {
        throw new Error(
          deviceResponse.error || t("error.challengeResponse.deviceChallengeResponseFailed")
        );
      }

      // Step 3: Validate the response format
      if (!ChallengeResponseHelper.validateChallengeResponse(deviceResponse)) {
        throw new Error(t("error.challengeResponse.invalidChallengeResponseFormat"));
      }

      // Step 4: Verify mapping with server
      const verificationResponse = await device?.verifyUserNodeMapping({
        request_id: request_id,
        challenge_response: deviceResponse.signedChallenge!,
        node_id: deviceResponse.nodeId!,
      });

      if (
        !verificationResponse ||
        verificationResponse.status !== "success"
      ) {
        throw new Error(t("error.challengeResponse.verifyNodeMappingFailed"));
      }

      const result = await device?.setNetworkCredentials(
        ssid as string,
        (password as string) || ""
      );

      if (result !== 0) {
        throw new Error(t("error.challengeResponse.setNetworkCredentialsFailed"));
      }

      updateChallengeResponseStage(2, false);

      // Store decoded node ID
      if (deviceResponse.nodeId) {
        decodedNodeIdRef.current = deviceResponse.nodeId;
      }

      // Poll for node details before setting up timezone
      if (deviceResponse.nodeId) {
        const nodeId = deviceResponse.nodeId;

        const node = store.nodeStore.nodesByID[nodeId] as ESPRMNode | undefined;
        if (!node?.nodeConfig) {
          // Use polling utility to wait for node config
          await pollUntilReady(
            async () => {
              await store.userStore.user?.getNodeDetails(nodeId);
              // CDF interceptor will update nodeStore with the latest node details
              const node = store.nodeStore.nodesByID[nodeId] as ESPRMNode | undefined;
              return node?.nodeConfig ?? null;
            },
            {
              maxAttempts: 5,
              intervalMs: 2000,
              label: POLLING.NODE_CONFIG_LABEL,
            }
          );
        }

        // Setup timezone for the node (non-blocking)
        await setupNodeTimeZone(nodeId);
      }
      updateChallengeResponseStage(3, false);

      // Handle provision success (add to group, set tokens, etc.)
      await handleProvisionSuccess();

    } catch (error: any) {
      console.error("Challenge-response provisioning failed:", error);
      throw error;
    }
  };

  /**
   * Performs traditional provisioning flow
   * Uses provision() with callback for status updates
   */
  const performProvisioning = async () => {
    try {
      await device?.provision(
        ssid as string,
        (password as string) || "",
        handleProvisionUpdate,
        currentHomeId as string
      );
    } catch (error) {
      console.error("Traditional provisioning failed:", error);
      throw error;
    }
  };

  /**
   * Start provisioning
   * Determines which flow to use based on device capabilities
   */
  const startProvisioning = async () => {
    try {
      const transportType = device?.transport || "";
      // Get device version info to check capabilities
      const versionInfo = await device?.getDeviceVersionInfo();

      // Check if device supports challenge-response capability
      const isChallengeResponseSupported = ChallengeResponseHelper.checkChallengeResponseCapability(
        versionInfo,
        transportType
      );

      // Set the flow type and stages
      if (isChallengeResponseSupported) {
        isChallengeResponseFlowRef.current = true; // Update ref
        const newStages = getChallengeResponseStages(t);
        setStages(newStages);
        stagesRef.current = newStages; // Update ref
        await performChallengeResponseProvisioning();
      } else {
        isChallengeResponseFlowRef.current = false; // Update ref
        const newStages = getProvisionStages(t);
        setStages(newStages);
        stagesRef.current = newStages; // Update ref
        await performProvisioning();
      }

    } catch (error) {
      handleProvisionError(error);
    }
  };

  const handleContinue = () => {
    // Check if the provisioned device is an agent device with readme URL
    if (decodedNodeIdRef.current) {
      const provisionedNode = store.nodeStore.nodesByID[
        decodedNodeIdRef.current
      ] as ESPRMNode | undefined;

      if (provisionedNode) {
        // Get readme URL from node config info
        const readmeUrl = provisionedNode?.nodeConfig?.info?.readme;

        // If has readme, redirect to Guide page
        if (readmeUrl) {
          const headerName =
            provisionedNode?.nodeConfig?.info?.name || "Device";
          const device = provisionedNode?.nodeConfig?.devices?.[0];
          const deviceDisplayName = device?.displayName || headerName;

          router.replace({
            pathname: "/(device)/Guide" as any,
            params: {
              url: readmeUrl,
              title: headerName,
              deviceName: deviceDisplayName,
              fromProvision: "true",
            },
          });
          return;
        }
      }
    }

    // Default behavior: navigate to Home
    router.dismissTo("/(group)/Home");
  };

  // Render
  return (
    <>
      <Header label={t("device.provision.title")} showBack qaId="header_provision" />
      <ScreenWrapper
        style={{
          ...globalStyles.screenWrapper,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_provision"
      >
        <View
          {...testProps("view_provision")}
          style={[globalStyles.flex1, globalStyles.itemCenter, styles.content]}
        >
          <View {...testProps("view_image_container_provision")} style={[globalStyles.itemCenter, styles.imageContainer]}>
            <Image
              {...testProps("image_provision")}
              source={require("../../assets/images/network.png")}
              style={styles.networkImage}
              resizeMode="contain"
            />
          </View>

          <ScrollView
            ref={stepsScrollViewRef}
            style={[globalStyles.fullWidth, styles.stepsScrollView]}
            contentContainerStyle={styles.stepsContainer}
            {...testProps("scroll_provision")}
            showsVerticalScrollIndicator={false}
          >
            {stages.map((stage) => (
              <ProvisioningStep
                key={stage.id}
                description={`${stage.title}`}
                status={mapStageStatusToProvisionStatus(stage.status)}
                error={stage.error}
              />
            ))}
          </ScrollView>

          <Button
            label={t("layout.shared.continue")}
            onPress={handleContinue}
            style={{
              ...globalStyles.btn,
              ...globalStyles.bgBlue,
              ...globalStyles.shadowElevationForLightTheme,
            }}
            disabled={!isComplete}
            qaId="button_continue_provision"
          />
        </View>
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  content: {
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
    padding: tokens.spacing._20,
  },
  imageContainer: {
    width: "100%",
    height: 160,
    marginBottom: tokens.spacing._20,
  },
  networkImage: {
    width: 160,
    height: 160,
  },
  stepsScrollView: {
    maxHeight: 300,
  },
  stepsContainer: {
    gap: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
  },
  stepContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: tokens.colors.white,
    marginBottom: tokens.spacing._5,
    borderRadius: tokens.radius.md,
    gap: tokens.spacing._10,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._5,
  },
  stepDescription: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.gray,
  },
  stepError: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.red,
    marginTop: tokens.spacing._5,
    marginLeft: tokens.spacing._5,
    fontFamily: tokens.fonts.regular,
  },
  button: {
    marginVertical: tokens.spacing._20,
  },
});

export default Provision;
