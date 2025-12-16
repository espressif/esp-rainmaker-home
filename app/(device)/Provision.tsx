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
} from "@/utils/constants";
import { setUserAuthForNode } from "@/utils/agent/device";
import { TOKEN_STORAGE_KEYS } from "@/utils/agent";

// Types
import { ProvisionStatus } from "@/types/global";

// Storage
import AsyncStorage from "@react-native-async-storage/async-storage";

type StageStatus = "pending" | "loading" | "success" | "error";

interface ProvisionStage {
  id: number;
  title: string;
  status: StageStatus;
  description: string;
}

interface ProvisioningStepProps {
  description: string;
  status: ProvisionStatus;
}

// Map our status to ProvisionStatus
const mapStageStatusToProvisionStatus = (
  status: StageStatus
): ProvisionStatus => {
  switch (status) {
    case "pending":
      return "progress";
    case "loading":
      return "progress";
    case "success":
      return "succeed";
    case "error":
      return "failed";
    default:
      return "pending";
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

// Message to stage mapping
const MESSAGE_STAGE_MAP: Record<string, number> = {
  [ESPProvProgressMessages.START_ASSOCIATION]: 1,
  [ESPProvProgressMessages.SENDING_ASSOCIATION_CONFIG]: 2,
  [ESPProvProgressMessages.ASSOCIATION_CONFIG_SENT]: 3,
  [ESPProvProgressMessages.DEVICE_PROVISIONED]: 4,
  [ESPProvProgressMessages.USER_NODE_MAPPING_SUCCEED]: 5,
};

/**
 * Renders a single provisioning step with status indicator
 * @returns JSX component
 */
const ProvisioningStep: React.FC<ProvisioningStepProps> = ({
  description,
  status,
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
  const stepsScrollViewRef = useRef<ScrollView>(null);
  // State
  const [stages, setStages] = useState<ProvisionStage[]>(() =>
    getProvisionStages(t)
  );
  const [isComplete, setIsComplete] = useState(false);
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
   * Updates the stage status based on the provisioning message
   */
  const updateStageStatus = (message: string, isError?: boolean) => {
    const stageId = MESSAGE_STAGE_MAP[message];

    if (!stageId) return;

    setStages((prevStages) => {
      const newStages = [...prevStages];

      if (isError) {
        // If there's an error, mark current and all subsequent stages as error
        for (let i = stageId - 1; i < newStages.length; i++) {
          newStages[i].status = "error";
        }
      } else {
        // Update current stage to success
        const currentStage = newStages[stageId - 1];
        if (currentStage) {
          currentStage.status = "success";
        }

        // Set next stage to loading if exists
        if (stageId < 5) {
          const nextStage = newStages[stageId];
          if (nextStage) {
            nextStage.status = "loading";
          }
        }
      }

      return newStages;
    });

    // Scroll to show latest step
    scrollToBottom();
  };

  /**
   * Handles provisioning updates and updates stages accordingly
   */
  const handleProvisionUpdate = async (response: ESPProvResponse) => {
    const message = response.description || "";
    const data = response.data || {};
    switch (response.status) {
      case ESPProvResponseStatus.succeed:
        // Update stage based on message
        updateStageStatus(message);

        // Handle specific messages
        if (message === ESPProvProgressMessages.USER_NODE_MAPPING_SUCCEED) {
          handleProvisionSuccess();
        } else if (message === ESPProvProgressMessages.START_ASSOCIATION) {
          updateStageStatus(message, false);
        }
        break;

      case ESPProvResponseStatus.onProgress:
        if (message === ESPProvProgressMessages.DECODED_NODE_ID) {
          const { nodeId } = data;
          decodedNodeIdRef.current = nodeId;
        }
        // Handle in progress status
        updateStageStatus(message, false);
        break;

      default:
        // Handle any other status as error
        handleProvisionError(new Error(message));
        // Mark all stages from current as failed
        updateStageStatus(message, true);
        break;
    }
  };

  /**
   * Handles provisioning error
   */
  const handleProvisionError = (error: any) => {
    console.error("Provision error:", error);

    // Find current loading stage and mark as error
    const loadingStageIndex = stages.findIndex(
      (stage) => stage.status === "loading"
    );
    if (loadingStageIndex >= 0) {
      updateStageStatus(
        Object.keys(MESSAGE_STAGE_MAP)[loadingStageIndex],
        true
      );
    }

    toast.showError(t("device.errors.provisioningFailed"));
    setIsComplete(true);
  };

  /**
   * Start provisioning
   * SDK function: ESPDevice.provision
   * this function is implemented in the ESPProvAdapter
   * @returns void
   */
  const startProvisioning = async () => {
    try {
      await device?.provision(
        ssid as string,
        (password as string) || "",
        handleProvisionUpdate,
        currentHomeId as string
      );
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
  button: {
    marginVertical: tokens.spacing._20,
  },
});

export default Provision;
