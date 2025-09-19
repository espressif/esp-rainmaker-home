/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Text,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";

// Hooks
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

// State Management
import { observer } from "mobx-react-lite";

// Components
import { PowerButton } from "@/components/ParamControls";
import { ParamControlWrap } from "@/components";

// Types
import { ControlPanelProps } from "@/types/global";

// Constants
import {
  ESPRM_POWER_PARAM_TYPE,
  ESPRM_UI_TOGGLE_PARAM_TYPE,
} from "@/utils/constants";
import { globalStyles } from "@/theme/globalStyleSheet";

/**
 * Switch Control Panel
 *
 * A control panel for switch devices that supports:
 * - Power toggle (ON/OFF)
 * - Simple and clean interface
 * - Refresh functionality
 *
 * @param node - The ESPRMNode representing the switch device
 * @param device - The ESPRMDevice representing the switch device
 * @returns JSX component for switch control
 */
const Switch: React.FC<ControlPanelProps> = ({ node, device }) => {
  // Hooks
  const toast = useToast();
  const { t } = useTranslation();

  // State
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Computed Values
  const isConnected = node.connectivityStatus?.isConnected || false;

  // Device Parameters - Look for power/toggle parameters
  const powerParam = device?.params?.find(
    (param) =>
      param.type === ESPRM_POWER_PARAM_TYPE ||
      param.type === ESPRM_UI_TOGGLE_PARAM_TYPE
  );

  // Get current power state
  const isPowerOn = Boolean(powerParam?.value);

  // Handlers
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const params = await device?.getParams();
      if (device && params) {
        device.params = params;
      }
    } catch (error) {
      console.error("Error refreshing device state:", error);
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
        styles.container,
        { opacity: isConnected ? 1 : 0.5 },
        { backgroundColor: tokens.colors.bg5 },
      ]}
    >
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            enabled={isConnected}
          />
        }
      >
        {/* Power Control */}
        {powerParam && (
          <View style={styles.powerButtonContainer}>
            <ParamControlWrap
              key={powerParam.name}
              param={powerParam}
              disabled={!isConnected}
              setUpdating={(s) => {
                setScrollEnabled(!s);
              }}
            >
              <PowerButton />
            </ParamControlWrap>

            {/* ON/OFF Status Label */}
            <View style={styles.statusContainer}>
              <Text
                style={[
                  styles.statusText,
                  isPowerOn ? styles.statusTextOn : styles.statusTextOff,
                ]}
              >
                {isPowerOn
                  ? t("device.panels.switch.on")
                  : t("device.panels.switch.off")}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg5,
  },
  content: {
    flex: 1,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._10,
    borderRadius: tokens.radius.md,
  },
  contentContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  powerButtonContainer: {
    flex: 1,
    maxHeight: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  statusContainer: {
    marginTop: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._20,
    paddingVertical: tokens.spacing._10,
  },
  statusText: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 1,
  },
  statusTextOn: {
    color: tokens.colors.primary,
  },
  statusTextOff: {
    color: tokens.colors.gray,
  },
});

export default observer(Switch);
