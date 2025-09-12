/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// contants
import {
  ESPRM_NAME_PARAM_TYPE,
  ESPRM_UI_HIDDEN_PARAM_TYPE,
} from "@/utils/constants";

// CDF
import {
  ESPAutomationConditionOperator,
  ESPRMDeviceParam,
  ESPAutomationEvent,
} from "@espressif/rainmaker-base-cdf";

// Hooks
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { observer } from "mobx-react-lite";
import { useRouter, useLocalSearchParams } from "expo-router";

// Components
import {
  Header,
  ScreenWrapper,
  ContentWrapper,
  ActionButton,
  ParamWrap,
} from "@/components";

// Config & Utils
import { PARAM_CONTROLS } from "@/config/params.config";
import { useAutomation } from "@/context/automation.context";

/**
 * UI Control Map for parameter types
 * Maps parameter types to their corresponding UI controls
 */
const PARAMS_UI = PARAM_CONTROLS.reduce((acc, control) => {
  if (control.types.includes("esp.ui.hidden")) return acc;
  control.types.forEach((type) => {
    acc[type] = {
      types: control.types,
      control: control.control,
      roomLabel: control.roomLabel,
    };
  });
  return acc;
}, {} as Record<string, any>); // Use any to avoid complex type issues

const defaultValueBasedOnParamDataType = (type: string) => {
  switch (type) {
    case "string":
      return "";
    case "int":
      return 0;
    case "bool":
      return false;
    case "float":
      return 0.0;
    default:
      return "";
  }
};

/**
 * EventDeviceParamSelection Component
 *
 * A screen component that allows users to configure event parameters for selected devices.
 * It displays the selected device's parameters and allows setting event conditions.
 *
 * Features:
 * - Shows selected device's parameters for event configuration
 * - Allows parameter condition selection (equals, greater than, etc.)
 * - Sets trigger values for automation events
 * - Bottom sheet for parameter condition configuration
 * - Creates automation events based on device parameter conditions
 */
const EventDeviceParamSelection = observer(() => {
  // Hooks
  const { t } = useTranslation();
  const router = useRouter();
  const { store } = useCDF();
  const { state, addEvent, updateEvent, setNodeId } = useAutomation();

  const { isEditingEvent } = useLocalSearchParams();
  const isEditing = isEditingEvent === "true";

  // State for event configuration - only one parameter can be selected for event trigger
  const [selectedParam, setSelectedParam] = useState<ESPRMDeviceParam | null>(
    null
  );
  const [paramSheetVisible, setParamSheetVisible] = useState(false);
  const [eventCondition, setEventCondition] =
    useState<ESPAutomationConditionOperator>(
      ESPAutomationConditionOperator.EQUAL
    ); // Default condition
  const [eventValue, setEventValue] = useState<any>(null);

  // Track which parameter has the event trigger configured
  const [activeEventParam, setActiveEventParam] = useState<string | null>(null);

  // Get selected event device from context (set by EventDeviceSelection)
  const { selectedDevice = null, params = [] } = useMemo(() => {
    const nodeId = state.selectedEventDevice?.nodeId;
    if (!nodeId) return {};
    const node = store.nodeStore.nodesByID[nodeId];
    if (!node || !node.nodeConfig) return {};
    const device = node.nodeConfig.devices.find(
      (device) => device.name === state.selectedEventDevice?.deviceName
    );
    if (!device) return {};

    const params = device.params?.map((param) => ({
      ...param,
      value: defaultValueBasedOnParamDataType(param.dataType), // Use actual device value or default
    }));

    const filteredParams = params?.filter(
      (param) =>
        ![ESPRM_NAME_PARAM_TYPE, ESPRM_UI_HIDDEN_PARAM_TYPE].includes(
          param.type
        )
    );

    return { selectedDevice: device, params: filteredParams };
  }, [state.selectedEventDevice]);

  // Initialize with existing event data when editing
  useEffect(() => {
    if (state.events && state.events.length > 0) {
      // For now, we only have one event for node parameter event
      const event = state.events[0];

      // Check if it's an ESPAutomationEvent and matches current device
      if (
        typeof event === "object" &&
        event !== null &&
        "deviceName" in event
      ) {
        const automationEvent = event as ESPAutomationEvent;

        // Check if this event belongs to the currently selected device
        if (state.nodeId === state.selectedEventDevice?.nodeId) {
          if (automationEvent.deviceName === selectedDevice?.name) {
            setActiveEventParam(automationEvent.param);
            setEventCondition(automationEvent.check);
            setEventValue(automationEvent.value);
          }
        }
      }
    }
  }, [state.events, selectedDevice?.name]);

  // Handlers
  const handleCreateEvent = async () => {
    if (!activeEventParam || !selectedDevice || eventValue === null) {
      return;
    }

    // Create automation event using the active event parameter
    const automationEvent: ESPAutomationEvent = {
      deviceName: selectedDevice.name,
      param: activeEventParam,
      check: eventCondition,
      value: eventValue,
    };

    if (isEditing) {
      // Update existing event (replace the first event if it exists)
      if (state.events.length > 0) {
        updateEvent(0, automationEvent);
      } else {
        addEvent(automationEvent);
      }
    } else {
      // Add event to automation context for new automation
      addEvent(automationEvent);
    }
    // Set context nodeId to the nodeId of the selected event device
    // only after successful creation/update of event
    setNodeId(state.selectedEventDevice?.nodeId!);

    // Always navigate back to CreateAutomation screen
    router.dismissTo("/(automation)/CreateAutomation");
  };

  const disableActionButton =
    !selectedDevice || !activeEventParam || eventValue === null;

  const renderParamValue = (param: ESPRMDeviceParam) => {
    // Only show event trigger value for the active event parameter
    if (activeEventParam === param.name && eventValue !== null) {
      // Show the configured event trigger value with condition
      const displayValue =
        typeof eventValue === "boolean"
          ? eventValue
            ? t("automation.eventParamSelection.parameterOn")
            : t("automation.eventParamSelection.parameterOff")
          : eventValue.toString();

      // Get formatted condition label
      const conditionLabel = getConditionLabel(eventCondition);
      return `${conditionLabel} ${displayValue}`;
    }

    // For non-active parameters, show placeholder
    return "";
  };

  // Helper function to get condition label (similar to DeviceAction component)
  const getConditionLabel = (condition: ESPAutomationConditionOperator) => {
    switch (condition) {
      case ESPAutomationConditionOperator.EQUAL:
        return t("automation.conditions.equals");
      case ESPAutomationConditionOperator.NOT_EQUAL:
        return t("automation.conditions.notEquals");
      case ESPAutomationConditionOperator.GREATER_THAN:
        return t("automation.conditions.greaterThan");
      case ESPAutomationConditionOperator.LESS_THAN:
        return t("automation.conditions.lessThan");
      case ESPAutomationConditionOperator.GREATER_THAN_OR_EQUAL:
        return t("automation.conditions.greaterThanOrEqual");
      case ESPAutomationConditionOperator.LESS_THAN_OR_EQUAL:
        return t("automation.conditions.lessThanOrEqual");
      default:
        return String(condition);
    }
  };

  const handleParamValueChange = (value: any) => {
    setEventValue(value);
    setSelectedParam((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        value: value,
      };
    });
  };

  const handleParamSelect = (param: ESPRMDeviceParam) => {
    // Clear previous selection and set new parameter
    setActiveEventParam(null); // Clear previous active parameter
    setSelectedParam(param);
    setEventValue(param.value); // Initialize with current param value

    // For boolean parameters, always use EQUAL condition
    // For other parameters, reset to default EQUAL condition
    setEventCondition(ESPAutomationConditionOperator.EQUAL);
    setParamSheetVisible(true);
  };

  const handleParamSheetClose = () => {
    // Don't clear eventValue and eventCondition here - keep them for display
    setParamSheetVisible(false);
    setSelectedParam(null);
  };

  const handleEventConditionSave = () => {
    // Set this parameter as the active event parameter
    if (selectedParam) {
      setActiveEventParam(selectedParam.name);
    }
    // Close the sheet - the values are already saved in state
    handleParamSheetClose();
  };

  const renderParamControl = (param: ESPRMDeviceParam): React.ReactNode => {
    if (!param.uiType) return null;
    const Control = PARAMS_UI[param.uiType]?.control as any; // Type assertion to handle complex type mismatch
    if (!Control) return null;
    return <Control />;
  };

  // Get available conditions based on parameter type
  const getAvailableConditions = (param: ESPRMDeviceParam | null) => {
    if (!param) return [];

    // For numeric and other parameters, show all comparison operators
    return [
      {
        label: "==",
        value: ESPAutomationConditionOperator.EQUAL,
        isVisible: true,
      },
      {
        label: ">",
        value: ESPAutomationConditionOperator.GREATER_THAN,
        isVisible: true,
      },
      {
        label: "<",
        value: ESPAutomationConditionOperator.LESS_THAN,
        isVisible: true,
      },
      {
        label: "!=",
        value: ESPAutomationConditionOperator.NOT_EQUAL,
      },
      {
        label: ">=",
        value: ESPAutomationConditionOperator.GREATER_THAN_OR_EQUAL,
      },
      {
        label: "<=",
        value: ESPAutomationConditionOperator.LESS_THAN_OR_EQUAL,
      },
    ];
  };

  return (
    <>
      <Header
        label={t("automation.eventParamSelection.title")}
        showBack={true}
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          padding: tokens.spacing._15,
        }}
      >
        <View style={{ flex: 1 }}>
          <FlatList
            data={params}
            style={{ flex: 1 }}
            renderItem={({ item }: { item: ESPRMDeviceParam }) => (
              <ContentWrapper
                title={item.name}
                style={{
                  marginBottom: tokens.spacing._10,
                  paddingBottom: tokens.spacing._15,
                  borderWidth: tokens.border.defaultWidth,
                  borderColor:
                    activeEventParam === item.name
                      ? tokens.colors.primary
                      : tokens.colors.borderColor,
                  backgroundColor:
                    activeEventParam === item.name
                      ? tokens.colors.primary + "10"
                      : "transparent",
                }}
                leftSlot={
                  <Text
                    style={[
                      globalStyles.fontMedium,
                      activeEventParam === item.name && {
                        color: tokens.colors.primary,
                      },
                    ]}
                  >
                    {renderParamValue(item)}
                  </Text>
                }
                onPress={() => {
                  handleParamSelect(item);
                }}
              />
            )}
            keyExtractor={(item) => item.name}
          />
        </View>

        {/* SAVE ACTION */}
        <View
          style={[globalStyles.actionButtonContainer, styles.buttonContainer]}
        >
          <ActionButton
            onPress={handleCreateEvent}
            disabled={disableActionButton}
            variant="secondary"
          >
            <View style={styles.buttonContent}>
              <Text style={[globalStyles.fontMedium]}>
                {t("layout.shared.done")}
              </Text>
            </View>
          </ActionButton>
        </View>
      </ScreenWrapper>

      {/* Parameter Configuration Bottom Sheet */}
      <Modal
        visible={paramSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={handleParamSheetClose}
      >
        <Pressable
          style={styles.modalContainer}
          onPress={handleParamSheetClose}
        >
          <Pressable
            style={styles.content}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <View style={styles.handle} />

            {/* Parameter UI */}
            <View style={styles.paramUIContainer}>
              {selectedParam && (
                <ParamWrap
                  key={`${selectedParam.name}-modal`}
                  param={{ ...selectedParam }}
                  disabled={false}
                  setUpdating={() => {}}
                  onValueChange={(value) => handleParamValueChange(value)}
                >
                  {renderParamControl(selectedParam)}
                </ParamWrap>
              )}
            </View>

            {/* Event Condition Selection */}
            {selectedParam?.dataType !== "bool" &&
              selectedParam?.dataType !== "string" && (
                <View style={styles.conditionContainer}>
                  <Text style={styles.conditionLabel}>
                    {t("automation.eventParamSelection.condition")}
                  </Text>
                  <View style={styles.conditionButtons}>
                    {getAvailableConditions(selectedParam)
                      .filter((condition) => condition.isVisible)
                      .map((condition) => (
                        <Pressable
                          key={condition.value}
                          style={[
                            styles.conditionButton,
                            eventCondition === condition.value &&
                              styles.conditionButtonActive,
                          ]}
                          onPress={() => setEventCondition(condition.value)}
                        >
                          <Text
                            style={[
                              styles.conditionButtonText,
                              eventCondition === condition.value &&
                                styles.conditionButtonTextActive,
                            ]}
                          >
                            {condition.label}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                </View>
              )}

            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              <ActionButton
                onPress={handleEventConditionSave}
                variant="primary"
                style={styles.actionButton}
              >
                <Text style={[globalStyles.fontMedium, globalStyles.textWhite]}>
                  {t("layout.shared.save")}
                </Text>
              </ActionButton>
            </View>

            {/* Bottom safe area */}
            <View style={styles.bottomSafeArea} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
});

export default EventDeviceParamSelection;

const styles = StyleSheet.create({
  buttonContainer: {
    marginTop: "auto",
    flexDirection: "column",
    alignItems: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  // Bottom Sheet Styles
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: "80%",
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  paramUIContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  actionButtonsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: tokens.spacing._10,
  },
  actionButton: {
    flex: 1,
  },
  bottomSafeArea: {
    height: 34,
  },
  // Condition Selection Styles
  conditionContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderColor,
  },
  conditionLabel: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: 12,
  },
  conditionHelpText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    marginBottom: 8,
    fontStyle: "italic",
  },
  conditionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  conditionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    backgroundColor: tokens.colors.white,
  },
  conditionButtonActive: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  conditionButtonText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  conditionButtonTextActive: {
    color: tokens.colors.white,
  },
});
