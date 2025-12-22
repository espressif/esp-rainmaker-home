/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import { ESPRMNode, ESPRMServiceParam } from "@espressif/rainmaker-base-sdk";

// Utils
import { getNodeSystemConfig, SYSTEM_PARAM_TYPES } from "@/utils/system";

// Hooks
import { useToast } from "@/hooks/useToast";

// Components
import CollapsibleCard from "../Cards/CollapsibleCard";
import { ConfirmationDialog } from "@/components";
import { router } from "expo-router";

interface DeviceOperationsProps {
  node: ESPRMNode;
  disabled?: boolean;
}

/**
 * DeviceOperations Component
 *
 * Displays and manages device operations (Reboot, Wi-Fi Reset, Factory Reset)
 * in a separate collapsible card. Only renders if:
 * - The node has esp.service.system service
 * - The user is the primary user of the node
 * - The service has one or more of the supported parameters
 *
 * Features:
 * - Shows operations in fixed order: Reboot, Wi-Fi Reset, Factory Reset
 * - Confirmation dialogs for destructive operations
 * - Updates device via setMultipleParams API
 * - Loading state during operations
 *
 * @param props - Component properties for operations management
 */
const DeviceOperations: React.FC<DeviceOperationsProps> = ({
  node,
  disabled,
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  // State
  const [isOperating, setIsOperating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    param: ESPRMServiceParam | null;
  }>({
    visible: false,
    param: null,
  });

  // Memoize system configuration to avoid recalculating on every render
  const { systemService, availableParams } = useMemo(
    () => getNodeSystemConfig(node),
    [node]
  );

  // Don't render if service doesn't exist or no params available
  if (!systemService || !availableParams || availableParams.length === 0) {
    return null;
  }

  // Don't render if user is not primary user
  if (!node.isPrimaryUser) {
    return null;
  }

  /**
   * Sorts parameters in the desired order: Reboot, Wi-Fi Reset, Factory Reset
   */
  const sortedParams = useMemo(() => {
    const order = [
      SYSTEM_PARAM_TYPES.REBOOT,
      SYSTEM_PARAM_TYPES.WIFI_RESET,
      SYSTEM_PARAM_TYPES.FACTORY_RESET,
    ];

    return availableParams.sort((a, b) => {
      const indexA = order.indexOf(a.type as (typeof order)[number]);
      const indexB = order.indexOf(b.type as (typeof order)[number]);
      /* If type not found in order, put it at the end */
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [availableParams]);

  /**
   * Handles system operation execution
   */
  const handleSystemOperation = async (param: ESPRMServiceParam) => {
    if (!systemService || disabled || isOperating) return;

    setIsOperating(true);

    try {
      await node.setMultipleParams({
        [systemService.name]: [
          {
            [param.name]: true,
          },
        ],
      });

      // Show success toast for all operations
      toast.showSuccess(
        t("device.settings.systemOperationSuccess", { operation: param.name })
      );

      // For factory reset, delete the node and navigate to home
      if (param.type === SYSTEM_PARAM_TYPES.FACTORY_RESET) {
        await node.delete();
        router.dismissTo("/(group)/Home");
      }
    } catch (error) {
      console.error("Error executing system operation:", error);
      toast.showError(
        t("device.settings.systemOperationFailed", { operation: param.name })
      );
    } finally {
      setIsOperating(false);
      setConfirmDialog({ visible: false, param: null });
    }
  };

  /**
   * Gets the display label for a system parameter
   */
  const getParamLabel = (param: ESPRMServiceParam): string => {
    switch (param.type) {
      case SYSTEM_PARAM_TYPES.REBOOT:
        return t("device.settings.reboot");
      case SYSTEM_PARAM_TYPES.FACTORY_RESET:
        return t("device.settings.factoryReset");
      case SYSTEM_PARAM_TYPES.WIFI_RESET:
        return t("device.settings.wifiReset");
      default:
        return param.name;
    }
  };

  /**
   * Gets the confirmation message for a system parameter
   */
  const getConfirmMessage = (param: ESPRMServiceParam): string => {
    switch (param.type) {
      case SYSTEM_PARAM_TYPES.REBOOT:
        return t("device.settings.rebootConfirm");
      case SYSTEM_PARAM_TYPES.FACTORY_RESET:
        return t("device.settings.factoryResetConfirmWithRemoval");
      case SYSTEM_PARAM_TYPES.WIFI_RESET:
        return t("device.settings.wifiResetConfirm");
      default:
        return t("device.settings.systemOperationConfirm", {
          operation: param.name,
        });
    }
  };

  /**
   * Determines if an operation is destructive (uses red button)
   */
  const isDestructiveOperation = (param: ESPRMServiceParam): boolean => {
    return (
      param.type === SYSTEM_PARAM_TYPES.FACTORY_RESET ||
      param.type === SYSTEM_PARAM_TYPES.WIFI_RESET
    );
  };

  /**
   * Handles button press - shows confirmation for all operations
   */
  const handleButtonPress = (param: ESPRMServiceParam) => {
      setConfirmDialog({ visible: true, param });
  };

  return (
    <>
      <CollapsibleCard
        title={t("device.settings.operationsTitle")}
        style={{
          ...globalStyles.shadowElevationForLightTheme,
          backgroundColor: tokens.colors.white,
        }}
      >
        <View style={{ gap: tokens.spacing._10 }}>
          {sortedParams.map((param) => (
            <TouchableOpacity
              key={param.name}
              style={[
                {
                  paddingVertical: tokens.spacing._10,
                  paddingHorizontal: tokens.spacing._15,
                  borderRadius: tokens.radius.md,
                  backgroundColor:
                    isDestructiveOperation(param)
                      ? tokens.colors.red
                      : tokens.colors.primary,
                  opacity: disabled || isOperating ? 0.5 : 1,
                },
              ]}
              onPress={() => handleButtonPress(param)}
              disabled={disabled || isOperating}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: tokens.spacing._10,
                }}
              >
                {isOperating && confirmDialog.param?.name === param.name && (
                  <ActivityIndicator
                    size="small"
                    color={tokens.colors.white}
                  />
                )}
                <Text
                  style={{
                    color: tokens.colors.white,
                    fontSize: tokens.fontSize.sm,
                    fontFamily: tokens.fonts.medium,
                  }}
                >
                  {getParamLabel(param)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </CollapsibleCard>

      {/* Confirmation Dialog */}
      {confirmDialog.param && (
        <ConfirmationDialog
          open={confirmDialog.visible}
          title={getParamLabel(confirmDialog.param)}
          description={getConfirmMessage(confirmDialog.param)}
          confirmText={t("layout.shared.confirm")}
          cancelText={t("layout.shared.cancel")}
          onConfirm={() => handleSystemOperation(confirmDialog.param!)}
          onCancel={() =>
            setConfirmDialog({ visible: false, param: null })
          }
          confirmColor={
            isDestructiveOperation(confirmDialog.param)
              ? tokens.colors.red
              : tokens.colors.primary
          }
          isLoading={isOperating}
        />
      )}
    </>
  );
};

export default DeviceOperations;

