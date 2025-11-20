/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
// Hooks
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

// State Management
import { observer } from "mobx-react-lite";

// Components
import {
  PowerButton,
  BrightnessSlider,
  HueSlider,
  SaturationSlider,
  ColorTemperatureSlider,
} from "@/components/ParamControls";
import { ParamControlWrap } from "@/components";

// Types
import { ControlPanelProps, Tab } from "@/types/global";
import {
  ESPRM_POWER_PARAM_TYPE,
  ESPRM_TEMPERATURE_PARAM_TYPE,
  ESPRM_HUE_PARAM_TYPE,
  ESPRM_SATURATION_PARAM_TYPE,
  ESPRM_BRIGHTNESS_PARAM_TYPE,
  ESPRM_UI_TOGGLE_PARAM_TYPE,
  COLOR_TAB,
  WHITE_TAB,
} from "@/utils/constants";

/**
 * Light Control Panel
 *
 * A control panel for light devices that supports:
 * - Power toggle
 * - Brightness control
 * - Color control (hue and saturation)
 * - White temperature control
 * - Scene presets (coming soon)
 *
 * @param node - The ESPRMNode representing the light device
 * @returns JSX component for light control
 */
const Light: React.FC<ControlPanelProps> = ({ node, device }) => {
  // Hooks
  const toast = useToast();
  const { t } = useTranslation();

  // Device Parameters
  const powerParam = device?.params?.find(
    (param) =>
      param.type === ESPRM_POWER_PARAM_TYPE ||
      param.uiType === ESPRM_UI_TOGGLE_PARAM_TYPE
  );

  const brightnessParam = device?.params?.find(
    (param) => param.type === ESPRM_BRIGHTNESS_PARAM_TYPE
  );

  const hueParam = device?.params?.find(
    (param) => param.type === ESPRM_HUE_PARAM_TYPE
  );

  const saturationParam = device?.params?.find(
    (param) => param.type === ESPRM_SATURATION_PARAM_TYPE
  );

  const temperatureParam = device?.params?.find(
    (param) => param.type === ESPRM_TEMPERATURE_PARAM_TYPE
  );

  // Check if device supports color (has both hue and saturation)
  const supportsColor = !!(hueParam && saturationParam);

  // Computed Values
  const isConnected = node.connectivityStatus?.isConnected || false;

  // State - Set default tab based on device capabilities
  const [activeTab, setActiveTab] = useState<Tab>(
    supportsColor ? COLOR_TAB : WHITE_TAB
  );
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Handlers
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const params = await device?.getParams();
      if (device && params) {
        device.params = params;
      }
    } catch (error) {
      toast.showError(
        t("layout.shared.errorHeader"),
        t("device.errors.failedToRefreshDeviceState")
      );
    } finally {
      setRefreshing(false);
    }
  };

  const renderTab = (tab: Tab) => (
    <TouchableOpacity
      key={tab}
      style={[styles.tab, activeTab === tab && styles.activeTab]}
      onPress={() => setActiveTab(tab)}
    >
      <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
        {tab === WHITE_TAB
          ? t("device.panels.light.whiteTab")
          : t("device.panels.light.colorTab")}
      </Text>
    </TouchableOpacity>
  );

  // Render
  return (
    <View
      style={[
        styles.container,
        { opacity: isConnected ? 1 : 0.5 },
        { backgroundColor: tokens.colors.bg5 },
      ]}
    >
      {/* Only show tabs if there are multiple modes available */}
      {supportsColor && (
        <View style={styles.tabContainer}>
          {([WHITE_TAB, COLOR_TAB] as Tab[]).map(renderTab)}
        </View>
      )}

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
          </View>
        )}

        {/* White Mode Controls */}
        {(activeTab === WHITE_TAB || !supportsColor) && (
          <>
            {brightnessParam && (
              <ParamControlWrap
                key={brightnessParam.name}
                param={brightnessParam}
                disabled={!isConnected || !powerParam?.value}
                setUpdating={(s) => {
                  setScrollEnabled(!s);
                }}
                style={styles.paramControlWrap}
              >
                <BrightnessSlider />
              </ParamControlWrap>
            )}
            {temperatureParam && (
              <ParamControlWrap
                key={temperatureParam.name}
                param={temperatureParam}
                disabled={!isConnected || !powerParam?.value}
                setUpdating={(s) => {
                  setScrollEnabled(!s);
                }}
                style={styles.paramControlWrap}
              >
                <ColorTemperatureSlider />
              </ParamControlWrap>
            )}
          </>
        )}

        {/* Color Mode Controls */}
        {supportsColor && activeTab === COLOR_TAB && (
          <>
            {brightnessParam && (
              <ParamControlWrap
                key={brightnessParam.name}
                param={brightnessParam}
                disabled={!isConnected || !powerParam?.value}
                setUpdating={(s) => {
                  setScrollEnabled(!s);
                }}
                style={styles.paramControlWrap}
              >
                <BrightnessSlider />
              </ParamControlWrap>
            )}
            {hueParam && (
              <ParamControlWrap
                key={hueParam.name}
                param={hueParam}
                disabled={!isConnected || !powerParam?.value}
                setUpdating={(s) => {
                  setScrollEnabled(!s);
                }}
                style={styles.paramControlWrap}
              >
                <HueSlider />
              </ParamControlWrap>
            )}
            {saturationParam && (
              <ParamControlWrap
                key={saturationParam.name}
                param={saturationParam}
                disabled={!isConnected || !powerParam?.value}
                setUpdating={(s) => {
                  setScrollEnabled(!s);
                }}
                style={styles.paramControlWrap}
              >
                <SaturationSlider />
              </ParamControlWrap>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  paramControlWrap: {
    width: "100%",
  },
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg1,
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: tokens.spacing._10,
  },
  tab: {
    paddingHorizontal: tokens.spacing._20,
    paddingVertical: tokens.spacing._10,
    marginHorizontal: tokens.spacing._5,
  },
  activeTab: {},
  tabText: {
    fontSize: 16,
    color: tokens.colors.gray,
    fontWeight: "500",
  },
  activeTabText: {
    color: tokens.colors.blue,
    fontWeight: "600",
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
    gap: 10,
    justifyContent: "center",
    height: "100%",
  },
  powerButtonContainer: {
    flex: 1,
    maxHeight: 200,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default observer(Light);
