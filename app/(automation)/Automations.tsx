/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useMemo } from "react";
import {
  StyleSheet,
  RefreshControl,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  Pressable,
} from "react-native";
// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
// Hooks
import { useRouter } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import { useFocusEffect } from "@react-navigation/native";
import { useAutomation } from "@/context/automation.context";
// Mobx observer
import { observer } from "mobx-react-lite";
// Icons
import { Zap, Plus, Edit, Trash2 } from "lucide-react-native";
// Components
import {
  Header,
  ScreenWrapper,
  Button,
  InputDialog,
  AutomationCard,
  AutomationMenuBottomSheet,
} from "@/components";
// CDF
import { ESPAPIError, ESPAutomation } from "@espressif/rainmaker-base-cdf";

/**
 * Automations Component
 *
 * A screen component that displays and manages automations.
 *
 * Features:
 * - Lists all available automations
 * - Redirect to CreateAutomation screen to create new automations
 * - Redirect to CreateAutomation screen to edit existing automations
 * - Delete existing automations
 * - Enable/disable automations
 * - Pull to refresh
 */
const Automations = observer(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { store } = useCDF();
  const { automationStore, groupStore } = store;
  const { resetState } = useAutomation();

  const { nodeAutomationList } = automationStore;
  // Get current home's nodes
  const currentHomeId = groupStore.currentHomeId;
  const currentHome = groupStore._groupsByID?.[currentHomeId];
  const nodeList = useMemo(
    () => currentHome?.nodes || [],
    [currentHome?.nodes]
  );

  /**
   * Filter automations based on whether their event nodeIds are present in current home's nodes
   */
  const filteredAutomations = useMemo(() => {
    if (!nodeAutomationList || nodeAutomationList.length === 0) {
      return [];
    }

    const currentHomeNodeIds = new Set(nodeList);

    // Filter automations that have nodeId present in current home's nodes
    return nodeAutomationList.filter((automation) => {
      const nodeId = automation.nodeId;
      return nodeId && currentHomeNodeIds.has(nodeId);
    });
  }, [nodeAutomationList, nodeList]);

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toggleLoadingStates, setToggleLoadingStates] = useState<
    Record<string, boolean>
  >({});
  const [selectedAutomation, setSelectedAutomation] =
    useState<ESPAutomation | null>(null);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [actionLoadingStates, setActionLoadingStates] = useState<
    Record<string, string>
  >({});
  const [isAutomationNameDialogVisible, setIsAutomationNameDialogVisible] =
    useState(false);
  const [automationName, setAutomationName] = useState("");

  /**
   * Opens the automation name input dialog to create a new automation
   */
  const handleAddAutomation = () => {
    setAutomationName("");
    setIsAutomationNameDialogVisible(true);
  };

  /**
   * Handles pull to refresh functionality
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await automationStore.syncAutomationList();
    } catch (error: unknown) {
      toast.showError(
        t("automation.errors.refreshFailed"),
        (error as ESPAPIError).description || t("automation.errors.fallback")
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [automationStore, toast]);

  /**
   * Handles automation card press to show bottom sheet
   */
  const handleAutomationPress = (automation: ESPAutomation) => {
    setSelectedAutomation(automation);
    setIsBottomSheetVisible(true);
  };

  /**
   * Handles closing the bottom sheet
   */
  const handleCloseBottomSheet = () => {
    setIsBottomSheetVisible(false);
    setSelectedAutomation(null);
  };

  /**
   * Handles automation actions (edit, delete)
   */
  const handleAutomationAction = async (
    automationId: string,
    action: string
  ) => {
    const automation = automationStore.getAutomationById(automationId);

    if (!automation) return;

    setActionLoadingStates((prev) => ({ ...prev, [automationId]: action }));

    try {
      switch (action) {
        case "edit": {
          // Navigate to CreateAutomation screen with automation data for editing
          router.push({
            pathname: "/(automation)/CreateAutomation",
            params: {
              automationId: automation.automationId,
              isEditing: "true",
            },
          } as any);
          break;
        }
        case "delete": {
          // Delete automation
          await automation.delete();
          toast.showSuccess(
            t("automation.automations.automationDeleted"),
            t("automation.automations.automationDeletedMessage")
          );
          break;
        }
        default:
          break;
      }
    } catch (error: unknown) {
      toast.showError(
        t("automation.errors.failedToActionAutomation", { action }),
        (error as ESPAPIError).description || t("automation.errors.fallback")
      );
    } finally {
      setTimeout(() => {
        setActionLoadingStates((prev) => {
          const newState = { ...prev };
          delete newState[automationId];
          return newState;
        });
      }, 1000);
      handleCloseBottomSheet();
    }
  };

  /**
   * Handles automation enable/disable toggle
   */
  const handleAutomationToggle = async (
    automation: ESPAutomation,
    enabled: boolean
  ) => {
    const automationId = automation.automationId;
    if (!automationId) return;

    setToggleLoadingStates((prev) => ({ ...prev, [automationId]: true }));

    try {
      // Update automation enabled state
      await automation.enable(enabled);
      toast.showSuccess(
        enabled
          ? t("automation.automations.automationEnabled")
          : t("automation.automations.automationDisabled"),
        enabled
          ? t("automation.automations.automationEnabledMessage")
          : t("automation.automations.automationDisabledMessage")
      );
    } catch (error: unknown) {
      toast.showError(
        t("automation.errors.failedToActionAutomation", {
          action: enabled ? "enable" : "disable",
        }),
        (error as ESPAPIError).description || t("automation.errors.fallback")
      );
    } finally {
      setToggleLoadingStates((prev) => {
        const newState = { ...prev };
        delete newState[automationId];
        return newState;
      });
    }
  };

  /**
   * Handles automation name input confirmation
   * Navigates to CreateAutomation with the entered name
   */
  const handleAutomationNameConfirm = (name: string) => {
    if (name.trim()) {
      resetState();
      setIsAutomationNameDialogVisible(false);
      router.push({
        pathname: "/(automation)/CreateAutomation",
        params: {
          automationName: name.trim(),
        },
      } as any);
    }
  };

  /**
   * Load automations on screen focus
   */
  useFocusEffect(
    useCallback(() => {
      const loadAutomations = async () => {
        setIsLoading(true);
        try {
          await automationStore.syncAutomationList();
        } catch (error: unknown) {
          toast.showError(
            t("automation.errors.failedToFetchAutomation"),
            (error as ESPAPIError).description ||
              t("automation.errors.fallback")
          );
        } finally {
          setIsLoading(false);
        }
      };

      loadAutomations();
    }, [automationStore])
  );

  /**
   * Gets menu options for the selected automation
   */
  const getAutomationMenuOptions = useMemo(() => {
    if (!selectedAutomation) return [];

    const automationId = selectedAutomation.automationId || "";

    return [
      {
        id: "edit",
        label: t("automation.automations.edit"),
        icon: <Edit size={16} color={tokens.colors.text_primary} />,
        onPress: () => handleAutomationAction(automationId, "edit"),
        loading: actionLoadingStates[automationId] === "edit",
      },
      {
        id: "delete",
        label: t("automation.automations.delete"),
        icon: <Trash2 size={16} color={tokens.colors.red} />,
        onPress: () => handleAutomationAction(automationId, "delete"),
        loading: actionLoadingStates[automationId] === "delete",
        destructive: true,
      },
    ];
  }, [t, actionLoadingStates, selectedAutomation]);

  /**
   * Renders empty state when no automations exist
   * Shows different content based on whether user has devices or not
   */
  const renderEmptyState = () => {
    const hasDevices = nodeList.length > 0;

    return (
      <View style={[globalStyles.automationEmptyStateContainer]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={tokens.colors.primary} />
          </View>
        ) : (
          <>
            <View style={globalStyles.automationEmptyStateIconContainerTop}>
              <Zap size={35} color={tokens.colors.primary} />
            </View>
            <Text style={globalStyles.emptyStateTitle}>
              {hasDevices
                ? t("automation.automations.noAutomationsYet")
                : t("automation.automations.noDevicesForAutomation")}
            </Text>
            <Text style={globalStyles.emptyStateDescription}>
              {hasDevices
                ? t("automation.automations.noAutomationsYetDescription")
                : t("automation.automations.noDevicesForAutomationDescription")}
            </Text>
            {!hasDevices && (
              <View style={styles.emptyStateButtonContainer}>
                <Pressable
                  style={styles.emptyStateButton}
                  onPress={() => router.push("/(device)/AddDeviceSelection")}
                >
                  <Plus size={24} color={tokens.colors.white} />
                  <Text style={styles.emptyStateButtonText}>
                    {t("automation.automations.addFirstDevice")}
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  /**
   * Renders automation list content
   */
  const renderAutomationList = () => {
    return (
      <View style={styles.scrollContent}>
        {filteredAutomations.map((automation) => {
          const automationId = automation.automationId;
          return (
            <AutomationCard
              key={automationId}
              automation={automation}
              onPress={() => handleAutomationPress(automation)}
              onToggle={(enabled) =>
                handleAutomationToggle(automation, enabled)
              }
              toggleLoading={toggleLoadingStates[automationId] || false}
            />
          );
        })}
      </View>
    );
  };

  // Determine whether to show plus button in header
  const showHeaderPlusButton = nodeList.length > 0;

  return (
    <>
      <Header
        label={t("automation.automations.title")}
        showBack={false}
        rightSlot={
          showHeaderPlusButton ? (
            <Plus
              size={24}
              color={tokens.colors.bg3}
              onPress={handleAddAutomation}
            />
          ) : undefined
        }
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          padding: 0,
        }}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[tokens.colors.primary]}
              tintColor={tokens.colors.primary}
            />
          }
        >
          {/* Main Content */}
          {filteredAutomations.length === 0
            ? renderEmptyState()
            : renderAutomationList()}
        </ScrollView>
        {/* Fixed Add Scene Button */}
        {nodeList.length > 0 && (
          <View style={globalStyles.automationAddButtonContainer}>
            <Button
              label={t("automation.automations.addAutomation")}
              onPress={handleAddAutomation}
              style={globalStyles.automationAddButton}
              disabled={isLoading}
            />
          </View>
        )}
      </ScreenWrapper>

      {/* Automation Menu Bottom Sheet */}
      <AutomationMenuBottomSheet
        visible={isBottomSheetVisible}
        automation={selectedAutomation}
        automationName={selectedAutomation?.automationName || "Automation"}
        options={getAutomationMenuOptions}
        onClose={handleCloseBottomSheet}
      />

      {/* Automation Name Input Dialog */}
      <InputDialog
        open={isAutomationNameDialogVisible}
        title={t("automation.automations.createAutomation")}
        inputPlaceholder={t("automation.automations.automationNamePlaceholder")}
        confirmLabel={t("layout.shared.next")}
        cancelLabel={t("layout.shared.cancel")}
        onSubmit={handleAutomationNameConfirm}
        onCancel={() => setIsAutomationNameDialogVisible(false)}
        initialValue={automationName}
      />
    </>
  );
});

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    maxHeight: "80%",
    overflow: "hidden",
  },
  scrollContent: {
    padding: tokens.spacing._15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyStateButtonContainer: {
    marginTop: tokens.spacing._20,
    width: "100%",
    paddingHorizontal: tokens.spacing._20,
  },
  emptyStateButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing._10,
  },
  emptyStateButtonText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.white,
  },
});

export default Automations;
