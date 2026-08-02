/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Stack } from "expo-router";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { useControl } from "@features/control/hooks";
import { useCDF } from "@shared/hooks/useCDF";

// Icons
import { Settings } from "lucide-react-native";

// Components
import { Header, ScreenWrapper, DeviceOfflineBanner } from "@shared/components";
import Fallback from "./device_panels/Fallback";
import LightControl from "./device_panels/Light";
import SwitchControl from "./device_panels/Switch";
import AiAgentControl from "./device_panels/AiAgent";
import CameraControl from "./device_panels/Camera";

// Utils
import { testProps } from "@shared/utils/testProps";
import { readAttributesForNodeId } from "@shared/utils/matterAttributeRead";

// iOS's interactive swipe-back gesture and the horizontal param sliders
// (Hue/Brightness/etc.) both claim horizontal pans with no coordination
// between them (sliders use Tamagui's JS responder system, not
// react-native-gesture-handler), so dragging a slider also pans the whole
// screen back. Android's stack gesture doesn't hijack drags the same way, so
// only disable it on iOS - the header back button still works everywhere.
const STACK_GESTURE_ENABLED = Platform.OS !== "ios";

const CONTROL_PANELS: Record<string, React.FC<any>> = {
  light: LightControl,
  switch: SwitchControl,
  "ai-agent": AiAgentControl,
  camera: CameraControl,
};

/**
 * Control Component
 * Main device control screen that renders different device controls based on device type.
 * Shows an offline last-seen banner above the panel when the node is unreachable.
 */
const Control = () => {
  const { t } = useTranslation();
  const { node, device, displayName, deviceConfig, handleMorePress } =
    useControl();
  const { store } = useCDF();

  // iOS parity: when entering the control screen for a Matter node, fire a
  // one-shot read of every matter param on the node so the panel paints
  // with live values regardless of whether the subscription has delivered
  // an initial frame yet. Mirrors the `getCurrentLevelValues()` /
  // `getCurrentSaturationValue()` calls in the native iOS RainMaker app's
  // `DeviceViewController+UIWorker.swift`. On Android the subscription
  // already delivers an initial ReportData on establishment, so this is
  // typically redundant — but it's idempotent (same dispatch path as a
  // subscription frame) and the FW wouldn't queue a second push for a
  // value that just matched the cached frame, so the cost is minimal.
  useEffect(() => {
    if (!node?.isMatter || !node.id) return;
    const user = store?.userStore?.user;
    if (!user) return;
    void readAttributesForNodeId(user, node.id);
  }, [node?.id, node?.isMatter, store?.userStore?.user]);

  // Early return for missing device. The node itself may still be resolved
  // (e.g. an offline pure-Matter node whose fallback device schema doesn't
  // match up), so keep the settings gear reachable off `node` alone -
  // Settings' Remove Device flow only needs the node, not a resolved device.
  if (!device) {
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: STACK_GESTURE_ENABLED }} />
        <Header
          label={t("device.control.title")}
          showBack={true}
          rightSlot={
            node ? (
              <Pressable
                {...testProps("button_more")}
                onPress={handleMorePress}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={{ transform: [{ translateX: 8 }] }}
              >
                <Settings size={24} color={tokens.colors.primary} />
              </Pressable>
            ) : undefined
          }
          qaId="header_control"
        />
        <ScreenWrapper
          style={styles.containerPadding}
          qaId="screen_wrapper_control"
          excludeTop={true}
        >
          <DeviceOfflineBanner
            node={node}
            qaId="device_control_offline"
            containerStyle={styles.offlineBanner}
          />
          <View
            {...testProps("view_control")}
            style={globalStyles.errorContainer}
          >
            <Text {...testProps("text_error")} style={globalStyles.errorText}>
              {t("device.control.deviceNotFound")}
            </Text>
          </View>
        </ScreenWrapper>
      </>
    );
  }

  // Device control renderer
  const renderDeviceControl = () => {
    if (!deviceConfig || !deviceConfig.controlPanel) {
      return <Fallback node={node as any} device={device} />;
    }

    const ControlPanel =
      CONTROL_PANELS[deviceConfig.controlPanel as keyof typeof CONTROL_PANELS];
    return <ControlPanel node={node} device={device} />;
  };

  // Render
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: STACK_GESTURE_ENABLED }} />
      <Header
        label={displayName}
        showBack={true}
        rightSlot={
          <Pressable
            {...testProps("button_more")}
            onPress={handleMorePress}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={{ transform: [{ translateX: 8 }] }}
          >
            <Settings size={24} color={tokens.colors.primary} />
          </Pressable>
        }
        qaId="header_control"
      />
      <ScreenWrapper
        style={styles.container}
        qaId="screen_wrapper_control"
        excludeTop={true}
      >
        <View {...testProps("view_control")} style={globalStyles.flex1}>
          <DeviceOfflineBanner
            node={node}
            qaId="device_control_offline"
            containerStyle={styles.offlineBanner}
          />
          {renderDeviceControl()}
        </View>
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    ...globalStyles.container,
    backgroundColor: tokens.colors.bg5,
  },
  containerPadding: {
    ...globalStyles.container,
    paddingBottom: 100,
  },
  offlineBanner: {
    marginHorizontal: tokens.spacing._10,
    marginBottom: tokens.spacing._10,
  },
});

export default observer(Control);
