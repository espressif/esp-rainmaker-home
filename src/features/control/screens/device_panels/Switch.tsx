/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Text,
} from "react-native";

// Styles
import { tokens } from "@shared/theme/tokens";

// Hooks
import { useToast } from "@shared/hooks/useToast";
import { useDeviceConnected } from "@shared/hooks/useDeviceConnected";
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";

// State Management
import { observer } from "mobx-react-lite";

// Components
import { PowerButton } from "@shared/components/ParamControls";
import { ParamControlWrap } from "@shared/components";
import { DevicePanelNoParamsEmptyState } from "@features/control/components";
import { useMatterDeviceStateSync } from "@shared/hooks/useMatterDeviceStateSync";
import { readMatterNodeIdFromCdfNode } from "@shared/utils/matterDeviceStateEvents";
import { resolveMatterEndpointFromDevice } from "@shared/utils/matterEndpoint";

// Utils
import { testProps } from "@shared/utils/testProps";

// Types
import { ControlPanelProps } from "@src/types/global";

// Constants
import {
  ESPRM_POWER_PARAM_TYPE,
  ESPRM_UI_TOGGLE_PARAM_TYPE,
} from "@shared/utils/constants";

/**
 * Switch Control Panel
 *
 * A control panel for switch devices that supports:
 * - Power toggle (ON/OFF)
 * - Simple and clean interface
 * - Refresh functionality
 * @param node - The ESPRMNode representing the switch device
 * @param device - The ESPRMDevice representing the switch device
 * @returns Simple scroll view with power/toggle param and refresh
 */
const Switch: React.FC<ControlPanelProps> = ({ node, device }) => {
  // Hooks
  const toast = useToast();
  const { t } = useTranslation();
  const { store } = useCDF();

  const storeNode = store.nodeStore.nodesByIDMap[node.id] ?? node;
  const storeDevice =
    storeNode.devices?.find((d) => d.name === device.name) ?? device;

  // State
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Computed Values
  const isConnected = useDeviceConnected(storeNode);

  // Device Parameters - Look for power/toggle parameters
  const powerParam = storeDevice?.params?.find(
    (param) =>
      param.type === ESPRM_POWER_PARAM_TYPE ||
      param.type === ESPRM_UI_TOGGLE_PARAM_TYPE,
  );

  const matterNodeId = useMemo(
    () => readMatterNodeIdFromCdfNode(storeNode),
    [storeNode],
  );
  const matterEndpoint = useMemo(
    () => resolveMatterEndpointFromDevice(storeDevice, powerParam?.name ?? "Power"),
    [storeDevice, powerParam?.name],
  );
  useMatterDeviceStateSync(matterNodeId, [matterEndpoint], { power: powerParam });

  // Get current power state
  const isPowerOn = Boolean(powerParam?.value);

  // Handlers
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const params = await storeDevice?.getParams();
      if (storeDevice && params) {
        storeDevice.params = params;
      }
    } catch (error) {
      console.error("Error refreshing device state:", error);
      toast.showError(
        t("layout.shared.errorHeader"),
        t("device.errors.failedToRefreshDeviceState"),
      );
    } finally {
      setRefreshing(false);
    }
  };

  if (storeDevice?.params?.length === 0) {
    return <DevicePanelNoParamsEmptyState />;
  }

  // Render
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tokens.colors.bg5 },
      ]}
      {...testProps("view_switch")}
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
        {...testProps("scroll_refresh_switch")}
      >
        {/* Power Control */}
        {powerParam && (
          <View
            {...testProps("view_switch")}
            style={styles.powerButtonContainer}
          >
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
            <View
              style={styles.statusContainer}
              {...testProps("view_status_switch")}
            >
              <Text
                style={[
                  styles.statusText,
                  isPowerOn ? styles.statusTextOn : styles.statusTextOff,
                ]}
                {...testProps("text_status_switch")}
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
