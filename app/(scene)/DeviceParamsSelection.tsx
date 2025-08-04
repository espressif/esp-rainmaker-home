/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// React Native Imports
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";

// Icons
import { Settings } from "lucide-react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// contants
import {
  ESPRM_NAME_PARAM_TYPE,
  ESPRM_UI_HIDDEN_PARAM_TYPE,
} from "@/utils/constants";

// SDK
import type { ESPRMDeviceParam } from "@espressif/rainmaker-base-sdk";

// Hooks
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { observer } from "mobx-react-lite";
import { useScene } from "@/context/scenes.context";

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

import { DeviceParamGroup } from "@/types/global";
import { useRouter } from "expo-router";

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
}, {} as Record<string, DeviceParamGroup["control"]>);

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
 * DeviceParamsSelection Component
 *
 * A screen component that allows users to configure parameters for selected devices.
 * It displays selected devices and their parameters with bottom sheet configuration.
 *
 * Features:
 * - Lists selected devices and their parameters
 * - Allows parameter selection and value adjustment
 * - Groups parameters by type
 * - Bottom sheet for parameter configuration
 * - Handles online/offline device states
 */
const DeviceParamsSelection = observer(() => {
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
  } = useScene();

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

    return { selectedDevice: device, nodeId, params };
  }, [state.selectedDevice, state.actions]);

  // Handlers
  const handleSave = async () => {
    router.back();
  };

  const disableActionButton = !selectedDevice;

  if (!selectedDevice) {
    return (
      <View style={globalStyles.emptyStateContainer}>
        <View style={globalStyles.emptyStateIconContainer}>
          <Settings size={35} color={tokens.colors.primary} />
        </View>
        <Text style={globalStyles.emptyStateTitle}>
          {t("scene.deviceParamsSelection.noDevicesAvailable")}
        </Text>
        <Text style={globalStyles.emptyStateDescription}>
          {t("scene.deviceParamsSelection.noActionsSelectedDescription")}
        </Text>
      </View>
    );
  }

  const renderParamValue = (param: ESPRMDeviceParam) => {
    if (!checkActionExists(nodeId, selectedDevice.name, param.name).exist) {
      return "";
    }

    const value = param.value;

    if (value === undefined || value === null) return "";
    if (typeof value === "boolean")
      return value
        ? t("scene.deviceParamsSelection.parameterOn")
        : t("scene.deviceParamsSelection.parameterOff");
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
      selectedDevice.name,
      selectedParam?.name || "",
      selectedParam?.value
    );
    handleParamSheetClose();
  };

  const handleParamDelete = () => {
    deleteActionValue(nodeId, selectedDevice.name, selectedParam?.name || "");
    handleParamSheetClose();
  };

  const renderParamControl = (param: ESPRMDeviceParam): React.ReactNode => {
    const Control = PARAMS_UI[param.uiType]?.control;
    if (!Control) return null;
    return <Control />;
  };

  return (
    <>
      <Header label={t("scene.deviceParamsSelection.title")} showBack={true} />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          padding: tokens.spacing._15,
        }}
      >
        <View style={{ flex: 1 }}>
          <FlatList
            data={params?.filter(
              (param) =>
                ![ESPRM_NAME_PARAM_TYPE, ESPRM_UI_HIDDEN_PARAM_TYPE].includes(
                  param.type
                )
            )}
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

        {/* SAVE ACTION */}
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

export default DeviceParamsSelection;

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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  paramName: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    flex: 1,
    marginRight: 16,
  },
  closeButton: {
    padding: 4,
  },
  paramUIContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  paramValue: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    marginBottom: 16,
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
