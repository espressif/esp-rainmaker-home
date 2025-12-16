/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Text,
  Image,
  ActivityIndicator,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { paramControlStyles } from "@/components/ParamControls/lib/styles";

// Hooks
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

// State Management
import { observer } from "mobx-react-lite";

// Types
import { ControlPanelProps } from "@/types/global";
import type { ESPRMService, ESPRMServiceParam } from "@espressif/rainmaker-base-sdk";

// Constants
import {
  ESPRM_AGENT_AUTH_SERVICE,
  ESPRM_REFRESH_TOKEN_PARAM_TYPE,
  ESPRM_RMAKER_USER_AUTH_SERVICE,
} from "@/utils/constants";

// Utils
import {
  findAgentIdParam,
  getCurrentAgentId,
  getAgentNameFromCache,
  saveAgentConfigToCache,
  getAgentConfig,
  setUserAuthForNode,
  TOKEN_STORAGE_KEYS,
} from "@/utils/agent";
import {
  validateAgent,
  removeInvalidAgentFromCustomData,
} from "@/utils/agent/aggregation";
import { useCDF } from "@/hooks/useCDF";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Icons
import { RefreshCw, Edit3 } from "lucide-react-native";

// Components
import AgentSelectionBottomSheet from "@/components/Modals/AgentSelectionBottomSheet";
import { ActionButton } from "@/components";

// Assets
const aiAnimationGif = require("@/assets/images/devices/ai-anitmation.gif");

/**
 * AI Agent Control Panel
 *
 * A control panel for AI Assistant devices that supports:
 * - Agent ID selection and update
 * - Refresh token functionality
 *
 * @param node - The ESPRMNode representing the AI assistant device
 * @param device - The ESPRMDevice representing the AI assistant device
 * @returns JSX component for AI assistant control
 */
const AiAgent: React.FC<ControlPanelProps> = ({ node, device }) => {
  // Hooks
  const toast = useToast();
  const { t } = useTranslation();
  const { store } = useCDF();

  // State
  const [refreshing, setRefreshing] = useState(false);
  const [isAgentSheetVisible, setIsAgentSheetVisible] = useState(false);
  const [isUpdatingAgent, setIsUpdatingAgent] = useState(false);
  const [agentName, setAgentName] = useState<string | null>(null);

  // Computed Values
  const isConnected = node.connectivityStatus?.isConnected || false;

  // Find Agent ID parameter using utility function
  const agentIdParam = findAgentIdParam(device);

  // Get current agent ID value using utility function
  const currentAgentId = getCurrentAgentId(device);

  // Fetch agent name from cache or API when agent ID changes
  useEffect(() => {
    const fetchAgentName = async () => {
      if (!currentAgentId) {
        setAgentName(null);
        return;
      }

      try {
        // First try to get from cache
        const cachedName = await getAgentNameFromCache(currentAgentId);
        if (cachedName) {
          setAgentName(cachedName);
          return;
        }

        // If not in cache, fetch from API
        const agentConfig = await getAgentConfig(currentAgentId);
        if (agentConfig?.name) {
          setAgentName(agentConfig.name);
          // Cache the config for future use
          await saveAgentConfigToCache(currentAgentId, agentConfig);
        } else {
          setAgentName(null);
        }
      } catch (error) {
        console.error("Failed to fetch agent name:", error);
        // On error, set to null to fallback to showing ID
        setAgentName(null);
      }
    };

    fetchAgentName();
  }, [currentAgentId]);

  // Handlers
  const handleEditAgentId = () => {
    if (!isConnected) return;
    setIsAgentSheetVisible(true);
  };

  const handleAgentSelect = async (selectedAgentId: string) => {
    if (!agentIdParam) {
      toast.showError(
        t("layout.shared.errorHeader"),
        t("device.panels.aiAgent.agentIdParamNotFound")
      );
      return;
    }

    setIsUpdatingAgent(true);
    try {
      // Validate agent before setting
      const validation = await validateAgent(selectedAgentId);

      if (!validation.isValid) {
        // Agent is invalid - show error and remove from custom data if applicable
        toast.showError(
          t("device.panels.aiAgent.agentInvalid") || "Agent Invalid",
          t("device.panels.aiAgent.agentNotFound") ||
            "Agent not found. It has been removed from your list."
        );

        // Remove from custom data if it exists there
        if (store?.userStore) {
          await removeInvalidAgentFromCustomData(
            selectedAgentId,
            store.userStore
          );
        }

        setIsUpdatingAgent(false);
        return;
      }

      // Agent is valid - proceed with setting it
      await agentIdParam.setValue(selectedAgentId);
      toast.showSuccess(t("device.panels.aiAgent.agentUpdated"));

      // Fetch and cache agent config after successful update
      try {
        const agentConfig = await getAgentConfig(selectedAgentId);
        if (agentConfig?.name) {
          setAgentName(agentConfig.name);
          await saveAgentConfigToCache(selectedAgentId, agentConfig);
        }
      } catch (error) {
        // Don't block UI if cache fails
        console.error("Failed to cache agent config after update:", error);
      }
    } catch (error) {
      console.error("Error updating agent ID:", error);
      toast.showError(
        t("layout.shared.errorHeader"),
        t("device.panels.aiAgent.agentUpdateError")
      );
    } finally {
      setIsUpdatingAgent(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Find the agent-auth and user-auth services
      let agentAuthService: ESPRMService | undefined = undefined;
      let userAuthService: ESPRMService | undefined = undefined;

      for(const service of node?.nodeConfig?.services || []) {
        switch (service.type) {
          case ESPRM_AGENT_AUTH_SERVICE:
            agentAuthService = service;
            break;
          case ESPRM_RMAKER_USER_AUTH_SERVICE:
            userAuthService = service;
            break;
        }
      }

      if (agentAuthService) {
      // Find the refresh-token parameter
      const refreshTokenParam: ESPRMServiceParam | undefined =
        agentAuthService.params?.find(
          (param) => param.type === ESPRM_REFRESH_TOKEN_PARAM_TYPE
        );

      if (!refreshTokenParam) {
        throw new Error(t("device.panels.aiAgent.refreshTokenParamNotFound"));
      }

      const refreshToken = await AsyncStorage.getItem(
        TOKEN_STORAGE_KEYS.REFRESH_TOKEN
      );

      // Update the refresh-token parameter to trigger refresh
      await node?.setMultipleParams({
        [agentAuthService.name]: [
          {
            [refreshTokenParam.name]: refreshToken,
          },
        ],
      });
      } else if (userAuthService) {
        await setUserAuthForNode(node);
      } else {
        throw new Error(t("device.panels.aiAgent.agentAuthServiceNotFound"));
      }
      toast.showSuccess(t("device.panels.aiAgent.tokenRefreshed"));
    } catch (error) {
      console.error("Error refreshing device token:", error);
      toast.showError(
        t("layout.shared.errorHeader"),
        t("device.errors.failedToRefreshDeviceState")
      );
    } finally {
      setRefreshing(false);
    }
  };

  // Render
  return (
    <View
      style={[
        globalStyles.flex1,
        styles.container,
        { opacity: isConnected ? 1 : 0.5 },
      ]}
    >
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            enabled={isConnected}
          />
        }
      >
        {/* AI Animation GIF */}
        <View style={styles.animationContainer}>
          <Image
            source={aiAnimationGif}
            style={styles.animationGif}
            resizeMode="contain"
          />
        </View>
      </ScrollView>

      {/* Agent ID Parameter Display - Positioned above refresh button */}
      {agentIdParam && (
        <View style={styles.agentIdContainer}>
          <TouchableOpacity
            style={[
              paramControlStyles.container,
              (!isConnected || isUpdatingAgent) && paramControlStyles.disabled,
            ]}
            onPress={handleEditAgentId}
            disabled={!isConnected || isUpdatingAgent}
          >
            <View style={paramControlStyles.content}>
              <View style={paramControlStyles.textContainer}>
                <Text style={paramControlStyles.title}>
                  {t("device.panels.aiAgent.agentName")}
                </Text>
                <Text style={paramControlStyles.value} numberOfLines={1}>
                  {agentName ||
                    currentAgentId ||
                    t("device.panels.aiAgent.noAgentSelected")}
                </Text>
              </View>
              <Edit3 size={20} color={tokens.colors.gray} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Refresh Token Button - Absolutely positioned at bottom */}
      <View style={styles.refreshButtonContainer}>
        <ActionButton
          variant="primary"
          onPress={handleRefresh}
          disabled={!isConnected || refreshing}
          style={styles.refreshButton}
        >
          <View style={styles.refreshButtonContent}>
            {refreshing ? (
              <ActivityIndicator size="small" color={tokens.colors.white} />
            ) : (
              <RefreshCw size={20} color={tokens.colors.white} />
            )}
            <Text
              style={[globalStyles.buttonText, globalStyles.buttonTextPrimary]}
            >
              {refreshing
                ? t("device.panels.aiAgent.refreshing")
                : t("device.panels.aiAgent.refreshToken")}
            </Text>
          </View>
        </ActionButton>
      </View>

      {/* Agent Selection Bottom Sheet */}
      <AgentSelectionBottomSheet
        visible={isAgentSheetVisible}
        onClose={() => setIsAgentSheetVisible(false)}
        onSelect={handleAgentSelect}
        currentAgentId={currentAgentId}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.bg5,
  },
  content: {
    ...globalStyles.flex1,
    padding: tokens.spacing._20,
    ...globalStyles.radiusMd,
  },
  contentContainer: {
    flexDirection: "column",
    ...globalStyles.alignCenter,
    ...globalStyles.justifyCenter,
    flexGrow: 1,
    paddingBottom: 180, // Space for Agent ID input and refresh button at bottom
    paddingVertical: tokens.spacing._30,
  },
  agentIdContainer: {
    position: "absolute",
    bottom: 100, // Position above refresh button
    left: tokens.spacing._20,
    right: tokens.spacing._20,
    zIndex: 10,
  },
  animationContainer: {
    ...globalStyles.flex1,
    ...globalStyles.justifyCenter,
    ...globalStyles.alignCenter,
    width: "100%",
    paddingVertical: tokens.spacing._20,
    marginTop: -150,
  },
  animationGif: {
    width: 700,
    height: 700,
  },
  refreshButtonContainer: {
    position: "absolute",
    bottom: tokens.spacing._30,
    left: tokens.spacing._20,
    right: tokens.spacing._20,
  },
  refreshButton: {
    width: "100%",
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._20,
    ...globalStyles.radiusMd,
    ...globalStyles.shadowElevationForLightTheme,
  },
  refreshButtonContent: {
    ...globalStyles.flex,
    ...globalStyles.alignCenter,
    ...globalStyles.justifyCenter,
    gap: tokens.spacing._10,
  },
});

export default observer(AiAgent);
