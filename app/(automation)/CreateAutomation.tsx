/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
// Hooks
import { useRouter, useLocalSearchParams } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import { useAutomation } from "@/context/automation.context";
// Icons
import {
  Plus,
  Edit3,
  Settings,
  Trash2,
  Check,
  Replace,
} from "lucide-react-native";
// Components
import {
  Header,
  ScreenWrapper,
  ContentWrapper,
  Input,
  ActionButton,
  AutomationDeviceCard,
} from "@/components";
import { Switch } from "tamagui";

// CDF
import { ESPAPIError, ESPAutomationEvent } from "@espressif/rainmaker-base-cdf";

// Types
import { LoadingState } from "@/types/global";

/**
 * CreateAutomation Component
 *
 * A screen component for creating and editing automations.
 * Allows users to define automation events (triggers) and actions.
 *
 * Features:
 * - Create new automations with custom names, events, and actions
 * - Edit existing automations
 * - Add/modify device event and actions
 * - Delete automations
 * - Validate automation requirements
 * - Configure retrigger settings
 */
const CreateAutomation = () => {
  // Hooks
  const { store } = useCDF();
  const { automationStore, groupStore } = store;
  const toast = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const {
    state,
    setAutomationName,
    resetState,
    setRetrigger,
    setAutomationInfo,
    // Automation management
    updateAutomation,
    deleteAutomation,
    createAutomation,
  } = useAutomation();

  const [loading, setLoading] = useState<LoadingState>({
    save: false,
    delete: false,
  });

  const [nameValidationError, setNameValidationError] = useState<string | null>(
    null
  );

  const { automationName, automationId, isEditing } = useLocalSearchParams();
  const automationLoadedRef = useRef(false);

  const currentHomeId = groupStore.currentHomeId;
  const currentHome = groupStore._groupsByID?.[currentHomeId];
  const currentHomeNodeList = useMemo(
    () => currentHome?.nodes || [],
    [currentHome?.nodes]
  );

  useEffect(() => {
    if (automationName) {
      setAutomationName(automationName as string);
    }
  }, [automationName, setAutomationName]); // setAutomationName is now memoized

  // Load automation data for editing (only once)
  useEffect(() => {
    if (isEditing === "true" && automationId && !automationLoadedRef.current) {
      const automation = automationStore.getAutomationById(
        automationId as string
      );
      if (automation) {
        setAutomationInfo(automation);
        automationLoadedRef.current = true;
      }
    }
  }, [isEditing, automationId, automationStore, setAutomationInfo]); // Added setAutomationInfo since it's now memoized

  // Memoize the automation list to prevent unnecessary re-renders
  const automationList = useMemo(() => {
    return automationStore.nodeAutomationList || [];
  }, [automationStore.nodeAutomationList]);

  // Real-time validation for automation name
  useEffect(() => {
    if (!state.automationName || state.automationName.trim().length === 0) {
      setNameValidationError(null);
      return;
    }

    const existingAutomation = automationList.find((automation) => {
      const isSameName =
        automation.automationName?.trim() === state.automationName.trim();

      // For editing mode, exclude the current automation being edited
      if (state.isEditing) {
        return isSameName && automation.automationId !== state.automationId;
      }

      // For new automations, check if any automation has the same name
      return isSameName;
    });

    if (existingAutomation) {
      setNameValidationError(
        t("automation.createAutomation.nameAlreadyExists")
      );
    } else {
      setNameValidationError(null);
    }
  }, [
    state.automationName,
    automationList,
    state.isEditing,
    state.automationId,
  ]);

  const resetAndNavigateToAutomations = useCallback(() => {
    resetState();
    router.dismissTo("/(automation)/Automations");
  }, [resetState, router]);

  /**
   * Handles automation update
   * Sends payload to update automation
   */
  const handleUpdateAutomation = async () => {
    try {
      setLoading((prev) => ({ ...prev, save: true }));
      // Validate automation name is not empty
      if (!state.automationName || state.automationName.trim().length === 0) {
        toast.showError(
          t("automation.errors.updateFailedMessage"),
          t("automation.errors.pleaseEnterAutomationName")
        );
        return;
      }

      await updateAutomation();
      toast.showSuccess(
        t("automation.createAutomation.automationUpdated"),
        t("automation.createAutomation.automationUpdatedMessage")
      );
      resetAndNavigateToAutomations();
    } catch (error: unknown) {
      toast.showError(
        t("automation.errors.updateFailedMessage"),
        (error as ESPAPIError).description || t("automation.errors.fallback")
      );
    } finally {
      setLoading((prev) => ({ ...prev, save: false }));
    }
  };

  /**
   * Handles automation deletion
   */
  const handleDeleteAutomation = async () => {
    try {
      setLoading((prev) => ({ ...prev, delete: true }));

      await deleteAutomation();
      toast.showSuccess(
        t("automation.createAutomation.automationDeleted"),
        t("automation.createAutomation.automationDeletedMessage")
      );

      resetAndNavigateToAutomations();
    } catch (error: unknown) {
      toast.showError(
        t("automation.errors.deleteFailedMessage"),
        (error as ESPAPIError).description || t("automation.errors.fallback")
      );
    } finally {
      setLoading((prev) => ({ ...prev, delete: false }));
    }
  };

  /**
   * Handles automation creation for new automations
   */
  const handleCreateAutomation = async () => {
    try {
      setLoading((prev) => ({ ...prev, save: true }));
      // Validate automation name is not empty
      if (!state.automationName || state.automationName.trim().length === 0) {
        toast.showError(
          t("automation.errors.failedToCreateAutomation"),
          t("automation.errors.pleaseEnterAutomationName")
        );
        return;
      }

      await createAutomation();

      // Show success toast
      toast.showSuccess(
        t("automation.createAutomation.automationCreated"),
        t("automation.createAutomation.automationCreatedMessage")
      );

      // Reset automation state and navigate back
      resetAndNavigateToAutomations();
    } catch (error: unknown) {
      const errorMessage =
        (error as ESPAPIError).description || t("automation.errors.fallback");
      toast.showError(
        t("automation.errors.failedToCreateAutomation"),
        errorMessage
      );
    } finally {
      setLoading((prev) => ({ ...prev, save: false }));
    }
  };

  /**
   * Navigates to event selection
   */
  const handleAddEvent = () => {
    router.push({
      pathname: "/(automation)/EventDeviceSelection",
      params: {
        isEditingEvent: state.isEditing ? "true" : "false",
      },
    } as any);
  };

  /**
   * Navigates to action selection
   */
  const handleAddAction = () => {
    router.push({
      pathname: "/(automation)/ActionDeviceSelection",
      params: {
        isEditingAction: state.isEditing ? "true" : "false",
      },
    } as any);
  };

  // Get event information for display (similar to ActionDeviceSelection)
  const eventInfo = useMemo(() => {
    if (!state.events || state.events.length === 0) return null;

    // We have only one event for node parameter event
    const event = state.events[0];

    // Check if it's an ESPAutomationEvent (device parameter event)
    if (typeof event === "object" && event !== null && "deviceName" in event) {
      const automationEvent = event as ESPAutomationEvent;
      return {
        deviceName: automationEvent.deviceName,
        parameter: automationEvent.param,
        condition: automationEvent.check,
        value: automationEvent.value,
      };
    }

    return null;
  }, [state.events]);

  // Find the actual device from the store using nodeId from automation context
  const eventDevice = useMemo(() => {
    if (!eventInfo || !state.nodeId) return null;

    // Get the specific node using nodeId from automation context
    const node = store.nodeStore.nodesByID[state.nodeId];
    if (!node?.nodeConfig?.devices) return null;

    // Find the device in the node by matching device name
    const device = node.nodeConfig.devices.find(
      (d) => d.name === eventInfo.deviceName
    );

    return device || null;
  }, [eventInfo, state.nodeId, store.nodeStore.nodesByID]);

  // Check if automation is valid (has events and actions)
  const isValidAutomation = useMemo(() => {
    const hasEvents = state.events.length > 0;
    const hasActions = Object.keys(state.actions).length > 0;
    const hasValidName =
      state.automationName && state.automationName.trim().length > 0;
    return hasEvents && hasActions && hasValidName && !nameValidationError;
  }, [
    state.events,
    state.actions,
    Object.keys(state.actions).length,
    state.automationName,
    nameValidationError,
  ]);

  // Memoized action cards calculation
  const actionCards = useMemo(() => {
    const cards: Array<{
      key: string;
      device: any;
      displayDeviceName: string;
      actions: Record<string, any>;
    }> = [];

    Object.entries(state.actions).forEach(([nodeId, deviceActions]) => {
      Object.entries(deviceActions).forEach(([deviceName, deviceParams]) => {
        // Check if node is in current home
        if (!currentHomeNodeList.includes(nodeId)) {
          return;
        }

        // Get device info from store
        const node = store.nodeStore.nodesByID[nodeId];
        const device = node?.nodeConfig?.devices?.find(
          (d) => d.name === deviceName
        );

        cards.push({
          key: `${nodeId}-${deviceName}`,
          device: device || { type: "switch", name: deviceName },
          displayDeviceName: device?.displayName || deviceName,
          actions: deviceParams as Record<string, any>,
        });
      });
    });

    return cards;
  }, [
    state.actions,
    Object.keys(state.actions).length,
    currentHomeNodeList,
    store.nodeStore.nodesByID,
  ]);

  /**
   * Renders the automation name section
   */
  const renderAutomationName = () => {
    return (
      <ContentWrapper
        title={t("automation.createAutomation.automationName")}
        style={{
          ...styles.contentWrapper,
          ...styles.section,
          ...(nameValidationError && styles.errorBorder),
        }}
      >
        <View style={[styles.inputContainer]}>
          <Input
            placeholder={t(
              "automation.createAutomation.automationNamePlaceholder"
            )}
            value={state.automationName}
            onFieldChange={setAutomationName}
            style={[styles.input]}
            border={false}
            paddingHorizontal={false}
            marginBottom={false}
          />
          <View style={[styles.editIcon]}>
            <Edit3 size={20} color={tokens.colors.text_secondary} />
          </View>
        </View>
        {nameValidationError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{nameValidationError}</Text>
          </View>
        )}
      </ContentWrapper>
    );
  };

  /**
   * Renders the retrigger toggle section
   */
  const renderRetriggerSection = () => {
    return (
      <View style={styles.section}>
        <View style={styles.toggleContainer}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>
              {t("automation.createAutomation.retrigger")}
            </Text>
            <Text style={styles.toggleDescription}>
              {t("automation.createAutomation.retriggerDescription")}
            </Text>
          </View>
          <Switch
            size="$2.5"
            borderColor={tokens.colors.bg1}
            borderWidth={0}
            checked={state.retrigger}
            disabled={!!nameValidationError}
            style={[
              globalStyles.switch,
              !!nameValidationError && styles.disabledButton,
            ]}
            onCheckedChange={(value) => setRetrigger(value)}
          >
            <Switch.Thumb
              animation="quicker"
              style={
                state.retrigger
                  ? globalStyles.switchThumbActive
                  : globalStyles.switchThumb
              }
            />
          </Switch>
        </View>
      </View>
    );
  };

  /**
   * Renders the events section
   */
  const renderEventsSection = () => {
    return (
      <View
        style={[styles.section, { flex: state.events.length !== 0 ? 0.5 : 1 }]}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            {t("automation.createAutomation.event")}
          </Text>
          <Pressable
            onPress={nameValidationError ? undefined : handleAddEvent}
            style={[
              styles.addButton,
              nameValidationError && styles.disabledButton,
            ]}
            disabled={!!nameValidationError}
          >
            {state.events.length === 0 ? (
              <Plus
                size={16}
                color={
                  nameValidationError
                    ? tokens.colors.text_secondary
                    : tokens.colors.text_primary
                }
              />
            ) : (
              <Replace
                size={16}
                color={
                  nameValidationError
                    ? tokens.colors.text_secondary
                    : tokens.colors.text_primary
                }
              />
            )}
          </Pressable>
        </View>
        <View style={styles.eventContainer}>
          {state.events.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyStateIconContainer}>
                <Settings size={35} color={tokens.colors.primary} />
              </View>
              <Text style={globalStyles.emptyStateTitle}>
                {t("automation.createAutomation.noEventSelected")}
              </Text>
              <Text style={globalStyles.emptyStateDescription}>
                {t("automation.createAutomation.noEventSelectedDescription")}
              </Text>
            </View>
          ) : (
            // Show DeviceAction card when editing (similar to actions section)
            <View style={styles.eventSummaryContainer}>
              {eventInfo && (
                <AutomationDeviceCard
                  key={`event-${eventInfo.deviceName}`}
                  device={
                    eventDevice || {
                      type: "switch",
                      name: eventInfo.deviceName,
                    }
                  }
                  displayDeviceName={
                    eventDevice?.displayName || eventInfo.deviceName
                  }
                  type="event"
                  eventConditions={{
                    [eventInfo.parameter]: {
                      condition: eventInfo.condition,
                      value: eventInfo.value,
                    },
                  }}
                  onPress={nameValidationError ? () => {} : handleAddEvent}
                />
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  /**
   * Renders the actions section (visible when events are configured)
   */
  const renderActionsSection = () => {
    // Show actions section when events are configured (for both new and editing)
    if (state.events.length === 0) {
      return null;
    }

    return (
      <View style={[styles.section, styles.actionsSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            {t("automation.createAutomation.actions")}
          </Text>
          <Pressable
            onPress={nameValidationError ? undefined : handleAddAction}
            style={[
              styles.addButton,
              nameValidationError && styles.disabledButton,
            ]}
            disabled={!!nameValidationError}
          >
            <Plus
              size={16}
              color={
                nameValidationError
                  ? tokens.colors.text_secondary
                  : tokens.colors.text_primary
              }
            />
          </Pressable>
        </View>
        {Object.keys(state.actions).length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Settings size={35} color={tokens.colors.primary} />
            </View>
            <Text style={globalStyles.emptyStateTitle}>
              {t("automation.createAutomation.noActionsSelected")}
            </Text>
            <Text style={globalStyles.emptyStateDescription}>
              {t("automation.createAutomation.noActionsSelectedDescription", {
                action: state.isEditing ? "update" : "create",
              })}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.actionScrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.actionScrollContent}
          >
            <View style={styles.actionSummaryContainer}>
              {actionCards.map((actionCard) => (
                <AutomationDeviceCard
                  key={actionCard.key}
                  device={actionCard.device}
                  displayDeviceName={actionCard.displayDeviceName}
                  type="action"
                  actions={actionCard.actions}
                  onPress={nameValidationError ? () => {} : handleAddAction}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    );
  };

  return (
    <>
      <Header
        label={
          state.isEditing
            ? t("automation.createAutomation.editAutomation")
            : t("automation.createAutomation.title")
        }
        showBack={true}
        onBackPress={() => {
          resetAndNavigateToAutomations();
        }}
      />
      <ScreenWrapper style={globalStyles.container}>
        {renderAutomationName()}
        {renderRetriggerSection()}
        {renderEventsSection()}
        {renderActionsSection()}

        {/* ACTION BUTTONS */}
        <View
          style={[globalStyles.actionButtonContainer, styles.buttonContainer]}
        >
          {/* CREATE ACTION (for new automations) */}
          {!state.isEditing && (
            <ActionButton
              onPress={handleCreateAutomation}
              disabled={
                loading.save || !!nameValidationError || !isValidAutomation
              }
              variant="primary"
            >
              {loading.save ? (
                <ActivityIndicator size="small" color={tokens.colors.white} />
              ) : (
                <View style={styles.buttonContent}>
                  <Check size={16} color={tokens.colors.white} />
                  <Text
                    style={[globalStyles.fontMedium, globalStyles.textWhite]}
                  >
                    {t("automation.actionDeviceSelection.createAutomation")}
                  </Text>
                </View>
              )}
            </ActionButton>
          )}

          {/* UPDATE ACTION */}
          {state.isEditing && (
            <ActionButton
              onPress={handleUpdateAutomation}
              disabled={
                loading.save || !!nameValidationError || !isValidAutomation
              }
              variant="primary"
            >
              {loading.save ? (
                <ActivityIndicator size="small" color={tokens.colors.white} />
              ) : (
                <View style={styles.buttonContent}>
                  <Check size={16} color={tokens.colors.white} />
                  <Text
                    style={[globalStyles.fontMedium, globalStyles.textWhite]}
                  >
                    {t("layout.shared.update")}
                  </Text>
                </View>
              )}
            </ActionButton>
          )}

          {/* DELETE ACTION */}
          {state.isEditing && (
            <ActionButton
              onPress={handleDeleteAutomation}
              disabled={loading.delete || !!nameValidationError}
              variant="danger"
            >
              {loading.delete ? (
                <ActivityIndicator size="small" color={tokens.colors.white} />
              ) : (
                <View style={styles.buttonContent}>
                  <Trash2 size={16} color={tokens.colors.white} />
                  <Text
                    style={[globalStyles.fontMedium, globalStyles.textWhite]}
                  >
                    {t("layout.shared.delete")}
                  </Text>
                </View>
              )}
            </ActionButton>
          )}
        </View>
      </ScreenWrapper>
    </>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  section: {
    marginBottom: tokens.spacing._15,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: tokens.spacing._10,
  },
  sectionLabel: {
    fontSize: tokens.fontSize.sm,
    fontWeight: 500,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    paddingLeft: tokens.spacing._5,
  },
  contentWrapper: {
    backgroundColor: tokens.colors.white,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: tokens.spacing._10,
  },
  input: {
    flex: 1,
    paddingRight: tokens.spacing._40,
  },
  editIcon: {
    top: tokens.spacing._10,
    position: "absolute",
    right: 0,
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
  },
  toggleInfo: {
    flex: 1,
    marginRight: tokens.spacing._10,
  },
  toggleLabel: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._5,
  },
  toggleDescription: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
  },
  addButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
  eventContainer: {
    flex: 1,
  },
  buttonContainer: {
    marginTop: "auto",
    flexDirection: "column",
    alignItems: "center",
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyStateIconContainer: {
    backgroundColor: tokens.colors.white,
    borderRadius: 48,
    padding: 20,
    marginBottom: 24,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  errorBorder: {
    borderColor: tokens.colors.red,
    borderWidth: tokens.border.defaultWidth,
  },
  errorContainer: {
    paddingTop: tokens.spacing._5,
    paddingBottom: tokens.spacing._10,
  },
  errorText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.red,
  },
  eventSummaryContainer: {
    gap: tokens.spacing._10,
  },
  actionsSection: {
    flex: 1,
    marginBottom: 0,
  },
  actionScrollView: {
    flex: 1,
    maxHeight: "80%",
  },
  actionScrollContent: {
    paddingBottom: tokens.spacing._20,
  },
  actionSummaryContainer: {
    gap: tokens.spacing._10,
  },
});

export default CreateAutomation;
