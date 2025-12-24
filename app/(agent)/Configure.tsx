/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { observer } from "mobx-react-lite";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Icons
import { MessageSquare } from "lucide-react-native";

// Hooks
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";

// Components
import { Header, ScreenWrapper, AgentTermsBottomSheet } from "@/components";

// Utils
import { testProps } from "@/utils/testProps";
import {
  getDeviceImage,
  extractDeviceType,
  findDeviceConfig,
} from "@/utils/device";
import {
  filterAIAssistantDevices,
  saveAgentConfigToCache,
  getAgentNameFromCache,
  getAgentConfig,
} from "@/utils/agent";
import { getAgentTermsAccepted } from "@/utils/agent/storage";

// Types
import { AIDeviceData } from "@/types/global";

/**
 * Configure Component
 *
 * A screen component for configuring agents via deep link.
 * Receives agent ID from URL parameters and allows updating AI Assistant devices.
 *
 * Features:
 * - Receives agent ID from deep link URL
 * - Lists all AI Assistant devices in the account
 * - Allows single or multiple device selection
 * - Updates Agent ID parameter for selected devices
 * - Shows loading state per device during update
 * - Shows success toast and navigates to home on success
 *
 * Route Params:
 * @param {string} [id] - Agent ID from deep link URL
 */
const Configure = observer(() => {
  // Hooks
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { store } = useCDF();
  const toast = useToast();

  // State
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(
    new Set()
  );
  const [updatingDevices, setUpdatingDevices] = useState<Set<string>>(
    new Set()
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [isLoadingAgentName, setIsLoadingAgentName] = useState(false);
  const [agentNameError, setAgentNameError] = useState<boolean>(false);
  const [showTermsBottomSheet, setShowTermsBottomSheet] = useState(false);

  /**
   * Filters and processes AI Assistant devices from all nodes
   */
  const aiDevices = useMemo(() => {
    return filterAIAssistantDevices(store?.nodeStore?.nodeList);
  }, [store?.nodeStore?.nodeList]);

  /**
   * Check if terms are accepted when component mounts
   */
  useEffect(() => {    
    if (store?.userStore) {
      const termsAccepted = getAgentTermsAccepted(store.userStore);
      if (!termsAccepted) {
        setShowTermsBottomSheet(true);
      }
    }
  }, [store]);

  /**
   * Fetch agent name from cache or API when agent ID changes
   */
  useEffect(() => {
    const fetchAgentName = async () => {
      if (!id) {
        setAgentName(null);
        setIsLoadingAgentName(false);
        setAgentNameError(false);
        return;
      }

      setIsLoadingAgentName(true);
      setAgentNameError(false);

      try {
        // First try to get from cache
        const cachedName = await getAgentNameFromCache(id);
        if (cachedName) {
          setAgentName(cachedName);
          setIsLoadingAgentName(false);
          return;
        }

        // If not in cache, fetch from API
        const agentConfig = await getAgentConfig(id);
        if (agentConfig?.name) {
          setAgentName(agentConfig.name);
          // Cache the config for future use
          await saveAgentConfigToCache(id, agentConfig);
          setAgentNameError(false);
        } else {
          setAgentName(null);
          setAgentNameError(true);
        }
      } catch (error) {
        console.error("Failed to fetch agent name:", error);
        // On error, set error flag to show note with ID
        setAgentName(null);
        setAgentNameError(true);
      } finally {
        setIsLoadingAgentName(false);
      }
    };

    fetchAgentName();
  }, [id]);

  /**
   * Toggles device selection
   */
  const handleDeviceToggle = (deviceKey: string) => {
    setSelectedDevices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(deviceKey)) {
        newSet.delete(deviceKey);
      } else {
        newSet.add(deviceKey);
      }
      return newSet;
    });
  };

  /**
   * Updates Agent ID for selected devices
   */
  const handleUpdateAgentId = async () => {
    if (!id || selectedDevices.size === 0) {
      toast.showError(t("agent.configure.noDevicesSelected"));
      return;
    }

    setIsUpdating(true);
    const updatePromises: Promise<void>[] = [];
    const deviceKeysToUpdate = Array.from(selectedDevices);

    // Set updating state for all selected devices
    setUpdatingDevices(new Set(deviceKeysToUpdate));

    // Update each selected device
    deviceKeysToUpdate.forEach((deviceKey) => {
      const [nodeId, deviceName] = deviceKey.split("-");
      const deviceData = aiDevices.find(
        (d) => d.node.id === nodeId && d.device.name === deviceName
      );

      if (deviceData && deviceData.agentIdParam) {
        const updatePromise = (async () => {
          try {
            await deviceData.agentIdParam!.setValue(id);
          } catch (error) {
            console.error(`Failed to update device ${deviceKey}:`, error);
            throw error;
          }
        })();

        updatePromises.push(updatePromise);
      }
    });

    try {
      const results = await Promise.allSettled(updatePromises);
      const successfulUpdates = results.filter(
        (result) => result.status === "fulfilled"
      ).length;
      const totalDevices = updatePromises.length;

      if (successfulUpdates > 0) {
        toast.showSuccess(
          t("agent.configure.updateSuccess"),
          successfulUpdates === totalDevices
            ? t("agent.configure.devicesUpdatedCount", {
                count: successfulUpdates,
              }) || `${successfulUpdates} device(s) updated successfully`
            : t("agent.configure.devicesUpdatedPartial", {
                successful: successfulUpdates,
                total: totalDevices,
              }) ||
                `${successfulUpdates} of ${totalDevices} device(s) updated successfully`
        );
      } else {
        toast.showError(t("agent.configure.updateError"));
      }

      // Fetch and cache agent config if agent ID is available
      if (id) {
        try {
          const agentConfig = await getAgentConfig(id);
          await saveAgentConfigToCache(id, agentConfig);
        } catch (error) {
          // Don't block UI if cache fails
          console.error("[configure] Failed to cache agent config:", error);
        }
      }

      // Navigate to home after short delay
      setTimeout(() => {
        router.replace("/(group)/Home");
      }, 1500);
    } catch (error) {
      console.error("Failed to update agent IDs:", error);
      toast.showError(t("agent.configure.updateError"));
    } finally {
      setIsUpdating(false);
      setUpdatingDevices(new Set());
      setSelectedDevices(new Set());
    }
  };

  /**
   * Gets unique key for device
   */
  const getDeviceKey = (nodeId: string, deviceName: string) => {
    return `${nodeId}-${deviceName}`;
  };

  /**
   * Handles chat option press
   */
  const handleChatPress = () => {
    if (id) {
      const params = new URLSearchParams({
        agentId: id,
      });
      if (agentName) {
        params.append("agentName", agentName);
      }
      router.push(`/(agent)/Settings?${params.toString()}`);
    }
  };

  /**
   * Renders chat option card
   */
  const renderChatCard = () => {
    if (!id) return null;

    return (
      <Pressable
        {...testProps("view_chat_card")}
        onPress={handleChatPress}
        style={[globalStyles.deviceCard, styles.deviceCard, styles.chatCard]}
      >
        {/* Chat Icon */}
        <View style={styles.deviceIconContainer}>
          <MessageSquare strokeWidth={1} size={32} color={tokens.colors.black} />
        </View>

        {/* Chat Info */}
        <View style={globalStyles.flex1}>
          <Text
            style={[
              globalStyles.fontMd,
              globalStyles.fontMedium,
              globalStyles.textPrimary,
              styles.deviceName,
            ]}
            numberOfLines={1}
          >
            {t("agent.configure.defaultChat")}
          </Text>
          <Text style={[globalStyles.fontSm, globalStyles.textSecondary]}>
            {t("agent.configure.addAgentToChat")}
          </Text>
        </View>
      </Pressable>
    );
  };

  /**
   * Renders a device card
   */
  const renderDeviceCard = (deviceData: AIDeviceData, index: number) => {
    const deviceKey = getDeviceKey(deviceData.node.id, deviceData.device.name);
    const isSelected = selectedDevices.has(deviceKey);
    const isUpdatingDevice = updatingDevices.has(deviceKey);
    const isDeviceOnline =
      deviceData.node.connectivityStatus?.isConnected || false;

    // Get device image using utils
    const deviceImage = getDeviceImage(deviceData.device.type, isDeviceOnline);
    const deviceType = extractDeviceType(deviceData.device.type);
    const deviceConfig = findDeviceConfig(deviceType);

    return (
      <Pressable
        key={deviceKey}
        {...testProps(`view_device_card_${index}`)}
        onPress={() =>
          isDeviceOnline && !isUpdatingDevice && handleDeviceToggle(deviceKey)
        }
        disabled={!isDeviceOnline || isUpdatingDevice}
        style={[
          globalStyles.deviceCard,
          styles.deviceCard,
          isSelected && styles.deviceCardSelected,
          !isDeviceOnline && globalStyles.deviceCardDisabled,
          isUpdatingDevice && styles.deviceCardUpdating,
        ]}
      >
        {/* Device Icon */}
        <View style={styles.deviceIconContainer}>
          <Image
            source={deviceImage}
            style={styles.deviceIcon}
            resizeMode="contain"
          />
        </View>

        {/* Device Info */}
        <View style={globalStyles.flex1}>
          <Text
            style={[
              globalStyles.fontMd,
              globalStyles.fontMedium,
              globalStyles.textPrimary,
              styles.deviceName,
            ]}
            numberOfLines={1}
          >
            {deviceData.device.displayName}
          </Text>
          {deviceConfig && (
            <Text style={[globalStyles.fontSm, globalStyles.textSecondary]}>
              {deviceConfig.groupLabel || deviceConfig.name}
            </Text>
          )}
        </View>

        {/* Status Badge */}
        {isUpdatingDevice ? (
          <ActivityIndicator size="small" color={tokens.colors.primary} />
        ) : !isDeviceOnline ? (
          <Text style={styles.offlineBadge}>{t("layout.shared.offline")}</Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <>
      <Header
        label={t("agent.configure.title")}
        showBack={true}
        customBackUrl="/(group)/Home"
        qaId="header_configure"
      />
      <ScreenWrapper
        style={globalStyles.agentSettingsContainer}
        qaId="screen_wrapper_configure"
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Agent ID Display */}
          {id && (
            <>
              <View style={styles.agentIdHeader}>
                <Text
                  {...testProps("text_agent_id_label")}
                  style={[
                    globalStyles.fontSm,
                    globalStyles.textSecondary,
                    globalStyles.fontMedium,
                  ]}
                >
                  {t("agent.configure.agentIdToSet")}
                </Text>
              </View>
              <View style={styles.agentIdValueContainer}>
                {isLoadingAgentName ? (
                  <ActivityIndicator size="small" color={tokens.colors.primary} />
                ) : agentNameError ? (
                  <>
                    <Text
                      {...testProps("text_agent_id_note")}
                      style={[
                        globalStyles.fontSm,
                        globalStyles.textSecondary,
                        globalStyles.textCenter,
                        { marginBottom: tokens.spacing._5 },
                      ]}
                    >
                      {t("agent.configure.agentConfigNotAvailable") || "Agent configuration not available"}
                    </Text>
                    <Text
                      {...testProps("text_agent_id_value")}
                      style={[
                        globalStyles.fontMd,
                        globalStyles.fontMedium,
                        globalStyles.textPrimary,
                        globalStyles.textCenter,
                      ]}
                    >
                      {id}
                    </Text>
                  </>
                ) : (
                  <Text
                    {...testProps("text_agent_id_value")}
                    style={[
                      globalStyles.fontMd,
                      globalStyles.fontMedium,
                      globalStyles.textPrimary,
                      globalStyles.textCenter,
                    ]}
                  >
                    {agentName || id}
                  </Text>
                )}
              </View>
            </>
          )}

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <Text
              style={[
                globalStyles.fontSm,
                globalStyles.textSecondary,
                globalStyles.textCenter,
              ]}
            >
              {t("agent.configure.selectDevices")}
            </Text>
          </View>

          {/* Chat Option */}
          {id && renderChatCard()}

          {aiDevices.map((deviceData, index) =>
            renderDeviceCard(deviceData, index)
          )}
        </ScrollView>

        {/* Footer Buttons */}
        {aiDevices.length > 0 && (
          <View
            style={[
              globalStyles.footerAddButtonContainer,
              {
                bottom: 5,
              },
            ]}
          >
            <Pressable
              {...testProps("button_update_agent_id")}
              onPress={handleUpdateAgentId}
              disabled={selectedDevices.size === 0 || isUpdating || !id}
              style={[
                globalStyles.footerAddButton,
                (selectedDevices.size === 0 || isUpdating || !id) &&
                  globalStyles.btnDisabled,
              ]}
            >
              {isUpdating ? (
                <ActivityIndicator color={tokens.colors.white} size="small" />
              ) : (
                <Text
                  style={[
                    globalStyles.buttonText,
                    globalStyles.buttonTextPrimary,
                    globalStyles.textCenter,
                  ]}
                >
                  {t("agent.configure.updateDevices")}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </ScreenWrapper>

      {/* Agent Terms Bottom Sheet */}
      <AgentTermsBottomSheet
        visible={showTermsBottomSheet}
        onClose={() => {
          setShowTermsBottomSheet(false);
          router.replace("/(group)/Home");
        }}
        onComplete={() => {
          setShowTermsBottomSheet(false);
        }}
        allowClose={true}
      />
    </>
  );
});

export default Configure;

const styles = StyleSheet.create({
  scrollView: {
    ...globalStyles.flex1,
  },
  scrollContent: {
    padding: tokens.spacing._10,
    gap: tokens.spacing._10,
    paddingBottom: 80,
  },
  agentIdContainer: {
    ...globalStyles.bgLightBlue,
    padding: tokens.spacing._20,
    marginBottom: tokens.spacing._15,
  },
  agentIdHeader: {
    marginBottom: tokens.spacing._5,
  },
  agentIdValueContainer: {
    ...globalStyles.bgWhite,
    padding: tokens.spacing._10,
    ...globalStyles.radiusSm,
    borderWidth: 1,
    borderColor: tokens.colors.primary,
  },
  instructionsContainer: {
    marginBottom: tokens.spacing._5,
  },
  deviceCard: {
    flexDirection: "row",
    ...globalStyles.alignCenter,
    borderWidth: 1,
    borderColor: tokens.colors.bg3,
  },
  deviceCardSelected: {
    borderColor: tokens.colors.primary,
    ...globalStyles.bgLightBlue,
  },
  deviceCardUpdating: {
    opacity: 0.7,
  },
  deviceIconContainer: {
    width: 56,
    height: 56,
    marginRight: tokens.spacing._15,
    ...globalStyles.justifyCenter,
    ...globalStyles.alignCenter,
  },
  deviceIcon: {
    width: 56,
    height: 56,
  },
  deviceName: {},
  updatingBadge: {
    ...globalStyles.flex,
    ...globalStyles.alignCenter,
    gap: tokens.spacing._5,
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    ...globalStyles.radiusSm,
  },
  updatingText: {
    ...globalStyles.fontXs,
    color: tokens.colors.white,
    fontWeight: "600",
  },
  offlineBadge: {
    ...globalStyles.fontXs,
    ...globalStyles.textGray,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
  },
  chatCard: {
    marginBottom: tokens.spacing._5,
  },
});
