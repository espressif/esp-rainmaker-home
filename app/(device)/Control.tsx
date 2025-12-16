/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import type { ESPRMNode, ESPRMDevice } from "@espressif/rainmaker-base-sdk";

// Hooks
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";

// State Management
import { observer } from "mobx-react-lite";

// Icons
import { Settings } from "lucide-react-native";

// Components
import { Header, ScreenWrapper } from "@/components";

// Utils
import { testProps } from "@/utils/testProps";
import Fallback from "@/app/(device)/device_panels/Fallback";
import LightControl from "@/app/(device)/device_panels/Light";
import SwitchControl from "@/app/(device)/device_panels/Switch";
import TemperatureControl from "@/app/(device)/device_panels/Temperature";
import AiAgentControl from "@/app/(device)/device_panels/AiAgent";

// Utils
import { extractDeviceType, findDeviceConfig } from "@/utils/device";

// Constants
import {
  ESPRM_NAME_PARAM_TYPE,
  MATTER_METADATA_KEY,
  MATTER_METADATA_DEVICE_NAME_KEY,
} from "@/utils/constants";

/**
 * Control Component
 * Main device control screen that renders different device controls based on device type
 */
const Control = () => {
  // Hooks
  const { store } = useCDF();
  const router = useRouter();
  const { t } = useTranslation();
  const { id, device: _device } = useLocalSearchParams<{
    id?: string;
    device?: string;
  }>();

  // Data
  const nodeList = store?.nodeStore?.nodeList || [];
  const node = nodeList.find((n) => n.id === id) as ESPRMNode | undefined;
  const device = node?.nodeConfig?.devices.find((d) => d.name === _device) as
    | ESPRMDevice
    | undefined;

  // Handlers
  const handleMorePress = () => {
    router.push(`/(device)/Settings?id=${id}&device=${_device}`);
  };

  // Get device name from Matter metadata or fallback to default
  const getDeviceName = (node: ESPRMNode | undefined, device: ESPRMDevice | undefined) => {
    if (!node || !device) return "";

    // Check if node metadata contains Matter key
    const metadata = node.metadata;
    if (metadata && metadata[MATTER_METADATA_KEY]) {
      const deviceName =
        metadata[MATTER_METADATA_KEY][MATTER_METADATA_DEVICE_NAME_KEY];
      if (deviceName) {
        return deviceName;
      }
    }
    // Return empty string as fallback
    return "";
  };

  // Get display name with fallback logic
  const getDisplayName = () => {
    const matterDeviceName = getDeviceName(node, device);
    if (matterDeviceName) return matterDeviceName;
    
    // Fallback to name parameter or display name
    const nameParam = device?.params?.find((param) => param.type === ESPRM_NAME_PARAM_TYPE);
    return nameParam?.value || device?.displayName || t("device.control.title");
  };

  const CONTROL_PANELS: Record<string, React.FC<any>> = {
    light: LightControl,
    switch: SwitchControl,
    temperature: TemperatureControl,
    "ai-agent": AiAgentControl,
  };

  // Early return for missing device
  if (!device) {
    return (
      <>
        <Header label={t("device.control.title")} showBack={true} qaId="header_control" />
        <ScreenWrapper style={styles.containerPadding} qaId="screen_wrapper_control" excludeTop={true}>
          <View {...testProps("view_control")} style={globalStyles.errorContainer}>
            <Text {...testProps("text_error")} style={globalStyles.errorText}>
              {t("device.control.deviceNotFound")}
            </Text>
          </View>
        </ScreenWrapper>
      </>
    );
  }

  // Device type detection
  const deviceType = extractDeviceType(device.type);

  // Device control renderer
  const renderDeviceControl = () => {
    const deviceConfig = findDeviceConfig(deviceType);
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
      <Header
        label={getDisplayName()}
        showBack={true}
        rightSlot={
          <Pressable {...testProps("button_more")} onPress={handleMorePress}>
            <Settings size={24} color={tokens.colors.primary} />
          </Pressable>
        }
        qaId="header_control"
      />
      <ScreenWrapper style={styles.container} qaId="screen_wrapper_control" excludeTop={true}>
        <View {...testProps("view_control")} style={globalStyles.flex1}>{renderDeviceControl()}</View>
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
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingVertical: tokens.spacing._10,
    gap: tokens.spacing._10,
  },
  footerItem: {
    flex: 1,
    height: 90,
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._10,
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
  },
  footerText: {
    color: tokens.colors.gray,
    fontFamily: tokens.fonts.medium,
    marginTop: tokens.spacing._5,
  },
  footerTextComingSoon: {
    color: tokens.colors.lightGray,
  },
});

export default observer(Control);
