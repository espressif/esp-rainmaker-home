/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
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
import type { ESPRMDeviceParam } from "@espressif/rainmaker-base-cdf";
// Hooks
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { observer } from "mobx-react-lite";
import { useAutomation } from "@/context/automation.context";
import { useRouter } from "expo-router";
// Icons
import { TriangleAlert } from "lucide-react-native";
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
import { ESPRM_PARAM_WRITE_PROPERTY } from "@/utils/constants";

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
 * ActionDeviceParamSelection Component
 *
 * A screen component that allows users to configure action parameters for selected devices.
 * It displays selected device's parameters and allows setting action values.
 *
 * Features:
 * - Lists selected device's parameters for action configuration
 * - Allows multiple parameter selection and value adjustment
 * - Bottom sheet for parameter configuration
 */
const ActionDeviceParamSelection = observer(() => {
  // Hooks
  const { t } = useTranslation();
  const router = useRouter();
  const { store } = useCDF();
  const {
    state,
    checkActionExists,
    getActionValue,
    setActionValue,
    deleteActionValue,
  } = useAutomation();

  // State
  const [selectedParam, setSelectedParam] = useState<ESPRMDeviceParam | null>(
    null
  );
  const [paramSheetVisible, setParamSheetVisible] = useState(false);

  // Get selected device from context (set by DeviceSelection)
  const {
    selectedDevice = null,
    nodeId = "",
    params = [],
  } = useMemo(() => {
    const nodeId = state.selectedDevice?.nodeId;
    if (!nodeId) return {};
    const node = store.nodeStore.nodesByID[nodeId];
    if (!node || !node.nodeConfig) return {};
    const device = node.nodeConfig.devices.find(
      (device) => device.name === state.selectedDevice?.deviceName
    );
    if (!device) return {};

    const params = device.params?.map((param) => ({
      ...param,
      value:
        getActionValue(nodeId, device.name, param.name) ||
        defaultValueBasedOnParamDataType(param.dataType),
    }));
    const filteredParams = params?.filter(
      (param) =>
        ![ESPRM_NAME_PARAM_TYPE, ESPRM_UI_HIDDEN_PARAM_TYPE].includes(
          param.type
        ) && param.properties?.includes(ESPRM_PARAM_WRITE_PROPERTY)
    );

    return { selectedDevice: device, nodeId, params: filteredParams };
  }, [state.selectedDevice, state.actions]);

  // Handlers
  const handleSave = async () => {
    router.back();
  };

  const disableActionButton = !selectedDevice;

  const renderParamValue = (param: ESPRMDeviceParam) => {
    if (!checkActionExists(nodeId, selectedDevice?.name, param.name).exist) {
      return "";
    }

    const value = param.value;

    if (value === undefined || value === null) return "";
    if (typeof value === "boolean")
      return value
        ? t("automation.actionParamSelection.parameterOn")
        : t("automation.actionParamSelection.parameterOff");
    return value.toString();
  };

  const handleParamValueChange = (value: any) => {
    setSelectedParam((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        value: value,
      };
    });
  };

  const handleParamSelect = (param: ESPRMDeviceParam) => {
    setSelectedParam(param);
    setParamSheetVisible(true);
  };

  const handleParamSheetClose = () => {
    setParamSheetVisible(false);
    setSelectedParam(null);
  };

  const handleParamSave = () => {
    setActionValue(
      nodeId,
      selectedDevice?.name || "",
      selectedParam?.name || "",
      selectedParam?.value
    );
    handleParamSheetClose();
  };

  const handleParamDelete = () => {
    deleteActionValue(
      nodeId,
      selectedDevice?.name || "",
      selectedParam?.name || ""
    );
    handleParamSheetClose();
  };

  const renderParamControl = (param: ESPRMDeviceParam): React.ReactNode => {
    if (!param.uiType) return null;
    const Control = PARAMS_UI[param.uiType]?.control as any; // Type assertion to handle complex type mismatch
    if (!Control) return null;
    return <Control />;
  };

  return (
    <>
      <Header
        label={t("automation.actionParamSelection.title")}
        showBack={true}
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          padding: tokens.spacing._15,
        }}
      >
        {params.length === 0 ? (
          <View style={styles.incompatibleParamsContainer}>
            <View style={styles.incompatibleParamsIconContainer}>
              <TriangleAlert size={35} color={tokens.colors.primary} />
            </View>
            <Text style={styles.incompatibleParamsTitle}>
              {t("automation.actionParamSelection.incompatibleParamsTitle", {
                deviceName: selectedDevice?.displayName,
              })}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              data={params}
              style={{ flex: 1 }}
              renderItem={({ item }) => (
                <ContentWrapper
                  title={item.name}
                  style={{
                    marginBottom: tokens.spacing._10,
                    paddingBottom: tokens.spacing._15,
                    borderWidth: tokens.border.defaultWidth,
                    borderColor: tokens.colors.borderColor,
                  }}
                  leftSlot={
                    <Text style={globalStyles.fontMedium}>
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
        )}

        {/* SAVE ACTION */}
        {params.length !== 0 ? (
          <View
            style={[globalStyles.actionButtonContainer, styles.buttonContainer]}
          >
            <ActionButton
              onPress={handleSave}
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
        ) : null}
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

            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              {checkActionExists(
                nodeId,
                selectedDevice?.name || "",
                selectedParam?.name || ""
              ).exist && (
                <ActionButton
                  onPress={handleParamDelete}
                  variant="danger"
                  style={styles.actionButton}
                >
                  <Text
                    style={[globalStyles.fontMedium, globalStyles.textWhite]}
                  >
                    {t("layout.shared.delete")}
                  </Text>
                </ActionButton>
              )}
              <ActionButton
                onPress={handleParamSave}
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

export default ActionDeviceParamSelection;

const styles = StyleSheet.create({
  incompatibleParamsContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  incompatibleParamsIconContainer: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md * 3,
    padding: tokens.spacing._20,
    marginBottom: tokens.spacing._20,
  },
  incompatibleParamsTitle: {
    ...globalStyles.emptyStateTitle,
    color: tokens.colors.text_secondary,
  },
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
});
