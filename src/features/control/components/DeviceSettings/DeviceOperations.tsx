/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Utils
import {
  getNodeSystemConfig,
  getSystemOperation,
  SYSTEM_OPERATION,
} from "@features/group/utils/system";

// Hooks
import { useToast } from "@shared/hooks/useToast";

// Components
import { CollapsibleCard, ConfirmationDialog } from "@shared/components";
import { router } from "expo-router";

import { ESPCDFNode, ESPCDFServiceParam } from "@store";

interface DeviceOperationsProps {
  node: ESPCDFNode;
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
 * - Updates device via setValue API
 * - Loading state during operations
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
    param: ESPCDFServiceParam | null;
  }>({
    visible: false,
    param: null,
  });

  // Memoize system configuration to avoid recalculating on every render
  const { systemService, availableParams } = useMemo(
    () => getNodeSystemConfig(node),
    [node],
  );

  /**
   * Sorts parameters in the desired order: Reboot, Wi-Fi Reset, Factory Reset
   */
  const sortedParams = useMemo(() => {
    if (!availableParams?.length) {
      return [];
    }
    const order = [
      SYSTEM_OPERATION.REBOOT,
      SYSTEM_OPERATION.NETWORK_RESET,
      SYSTEM_OPERATION.FACTORY_RESET,
    ];

    return [...availableParams].sort((a, b) => {
      const indexA = order.indexOf(getSystemOperation(a) as (typeof order)[number]);
      const indexB = order.indexOf(getSystemOperation(b) as (typeof order)[number]);
      /* If operation not found in order, put it at the end */
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [availableParams]);

  // Don't render if service doesn't exist or no params available
  if (!systemService || !availableParams || availableParams.length === 0) {
    return null;
  }

  if (!node.isPrimaryUser) {
    return null;
  }

  /**
   * Handles system operation execution
   */
  const handleSystemOperation = async (param: ESPCDFServiceParam) => {
    if (!systemService || disabled || isOperating) return;

    setIsOperating(true);

    try {
      // For Factory reset the operation is delegated to
      // delete operation; each sdk-adaptor implements the backend-specific steps.
      if (getSystemOperation(param) === SYSTEM_OPERATION.FACTORY_RESET) {
        await node.delete();
        toast.showSuccess(
          t("device.settings.systemOperationSuccess", {
            operation: param.name,
          }),
        );
        router.dismissTo("/(group)/Home");
      } else {
        await param.setValue(true);
        toast.showSuccess(
          t("device.settings.systemOperationSuccess", {
            operation: param.name,
          }),
        );
      }
    } catch (error) {
      console.error("Error executing system operation:", error);
      toast.showError(
        t("device.settings.systemOperationFailed", { operation: param.name }),
      );
    } finally {
      setIsOperating(false);
      setConfirmDialog({ visible: false, param: null });
    }
  };

  /**
   * Gets the display label for a system parameter
   */
  const getParamLabel = (param: ESPCDFServiceParam): string => {
    switch (getSystemOperation(param)) {
      case SYSTEM_OPERATION.REBOOT:
        return t("device.settings.reboot");
      case SYSTEM_OPERATION.FACTORY_RESET:
        return t("device.settings.factoryReset");
      case SYSTEM_OPERATION.NETWORK_RESET:
        return t("device.settings.wifiReset");
      default:
        return param.name;
    }
  };

  /**
   * Gets the confirmation message for a system parameter
   */
  const getConfirmMessage = (param: ESPCDFServiceParam): string => {
    switch (getSystemOperation(param)) {
      case SYSTEM_OPERATION.REBOOT:
        return t("device.settings.rebootConfirm");
      case SYSTEM_OPERATION.FACTORY_RESET:
        return t("device.settings.factoryResetConfirmWithRemoval");
      case SYSTEM_OPERATION.NETWORK_RESET:
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
  const isDestructiveOperation = (param: ESPCDFServiceParam): boolean => {
    const operation = getSystemOperation(param);
    return (
      operation === SYSTEM_OPERATION.FACTORY_RESET ||
      operation === SYSTEM_OPERATION.NETWORK_RESET
    );
  };

  /**
   * Handles button press - shows confirmation for all operations
   */
  const handleButtonPress = (param: ESPCDFServiceParam) => {
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
                  backgroundColor: isDestructiveOperation(param)
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
                  <ActivityIndicator size="small" color={tokens.colors.white} />
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
          onCancel={() => setConfirmDialog({ visible: false, param: null })}
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
