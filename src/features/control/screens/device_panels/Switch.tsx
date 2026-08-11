/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { View, StyleSheet, Text } from "react-native";

// Styles
import { tokens } from "@shared/theme/tokens";

// Hooks
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
 *
 * Content-only (no nested ScrollView): Control owns the shared scroll + pull-to-refresh.
 * @param props - Node, device, and optional parent scroll lock callback
 * @returns Power/toggle param UI for the switch device
 */
const Switch: React.FC<ControlPanelProps> = ({
  node,
  device,
  setScrollEnabled,
}) => {
  const { t } = useTranslation();
  const { store } = useCDF();

  const storeNode = store.nodeStore.nodesByIDMap[node.id] ?? node;
  const storeDevice =
    storeNode.devices?.find((d) => d.name === device.name) ?? device;

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
    () =>
      resolveMatterEndpointFromDevice(storeDevice, powerParam?.name ?? "Power"),
    [storeDevice, powerParam?.name],
  );
  useMatterDeviceStateSync(matterNodeId, [matterEndpoint], { power: powerParam });

  // Get current power state
  const isPowerOn = Boolean(powerParam?.value);

  /**
   * Locks Control's shared ScrollView while a param gesture is active.
   * @param updating - True while the control is being interacted with
   */
  const onSetUpdating = (updating: boolean) => {
    setScrollEnabled?.(!updating);
  };

  if (storeDevice?.params?.length === 0) {
    return <DevicePanelNoParamsEmptyState />;
  }

  // Render
  return (
    <View
      style={[styles.container, { backgroundColor: tokens.colors.bg5 }]}
      {...testProps("view_switch")}
    >
      <View style={styles.content} {...testProps("scroll_refresh_switch")}>
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
              setUpdating={onSetUpdating}
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
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.bg5,
  },
  content: {
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._10,
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  powerButtonContainer: {
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
