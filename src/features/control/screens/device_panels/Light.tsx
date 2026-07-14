/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";

// Styles
import { tokens } from "@shared/theme/tokens";

// Hooks
import { useToast } from "@shared/hooks/useToast";
import { useDeviceConnected } from "@shared/hooks/useDeviceConnected";
import { useTranslation } from "react-i18next";

// Utils
import { testProps } from "@shared/utils/testProps";

// State Management
import { observer } from "mobx-react-lite";

// Components
import {
  PowerButton,
  BrightnessSlider,
  HueSlider,
  SaturationSlider,
  ColorTemperatureSlider,
} from "@shared/components/ParamControls";
import { ParamControlWrap } from "@shared/components";
import { DevicePanelNoParamsEmptyState } from "@features/control/components";
import { useMatterDeviceStateSync } from "@shared/hooks/useMatterDeviceStateSync";
import {
  readMatterNodeIdFromCdfNode,
  resolveMatterEndpointsForDevice,
} from "@shared/utils/matterDeviceStateEvents";

// Types
import { ControlPanelProps, Tab } from "@src/types/global";
import {
  ESPRM_POWER_PARAM_TYPE,
  ESPRM_TEMPERATURE_PARAM_TYPE,
  ESPRM_HUE_PARAM_TYPE,
  ESPRM_SATURATION_PARAM_TYPE,
  ESPRM_BRIGHTNESS_PARAM_TYPE,
  ESPRM_CCT_PARAM_TYPE,
  ESPRM_LIGHT_MODE_PARAM_TYPE,
  ESPRM_UI_TOGGLE_PARAM_TYPE,
  COLOR_TAB,
  WHITE_TAB,
} from "@shared/utils/constants";

/**
 * Light Control Panel
 *
 * A control panel for light devices that supports:
 * - Power toggle
 * - Brightness control
 * - Color control (hue and saturation)
 * - White: brightness + temperature (esp.param.temperature) and/or CCT (esp.param.cct)
 * - Light mode (esp.param.light-mode) synced with White / Color tab when present
 * - Scene presets (coming soon)
 * @param node - The ESPRMNode representing the light device
 * @returns Tabbed light UI (white/color) with ParamControls for power, level, and color
 */
const Light: React.FC<ControlPanelProps> = ({ node, device }) => {
  // Hooks
  const toast = useToast();
  const { t } = useTranslation();

  // Device Parameters
  const powerParam = device?.params?.find(
    (param) =>
      param.type === ESPRM_POWER_PARAM_TYPE ||
      param.uiType === ESPRM_UI_TOGGLE_PARAM_TYPE,
  );

  const brightnessParam = device?.params?.find(
    (param) => param.type === ESPRM_BRIGHTNESS_PARAM_TYPE,
  );

  const hueParam = device?.params?.find(
    (param) => param.type === ESPRM_HUE_PARAM_TYPE,
  );

  const saturationParam = device?.params?.find(
    (param) => param.type === ESPRM_SATURATION_PARAM_TYPE,
  );

  const temperatureParam = device?.params?.find(
    (param) => param.type === ESPRM_TEMPERATURE_PARAM_TYPE,
  );

  const cctParam = device?.params?.find(
    (param) => param.type === ESPRM_CCT_PARAM_TYPE,
  );

  const lightModeParam = device?.params?.find(
    (param) => param.type === ESPRM_LIGHT_MODE_PARAM_TYPE,
  );

  // Check if device supports color (has both hue and saturation)
  const supportsColor = !!(hueParam && saturationParam);

  const lightModeBounds = lightModeParam?.bounds as {
    min?: number;
    max?: number;
  } | undefined;
  const lightModeMin =
    typeof lightModeBounds?.min === "number" ? lightModeBounds.min : undefined;
  const lightModeMax =
    typeof lightModeBounds?.max === "number" ? lightModeBounds.max : undefined;

  const lightModeValueForTab = (tab: Tab): number | null => {
    if (lightModeMin === undefined || lightModeMax === undefined) return null;
    return tab === WHITE_TAB ? lightModeMax : lightModeMin;
  };

  // Computed Values
  const isConnected = useDeviceConnected(node);

  const matterNodeId = useMemo(() => readMatterNodeIdFromCdfNode(node), [node]);
  const matterEndpoints = useMemo(
    () => resolveMatterEndpointsForDevice(device),
    [device],
  );
  useMatterDeviceStateSync(matterNodeId, matterEndpoints, {
    power: powerParam,
    brightness: brightnessParam,
    hue: hueParam,
    saturation: saturationParam,
    temperature: temperatureParam,
    cct: cctParam,
  });

  const defaultTab = (): Tab => {
    if (!supportsColor) return WHITE_TAB;
    if (
      lightModeParam &&
      lightModeParam.value !== undefined &&
      lightModeParam.value !== null &&
      lightModeMin !== undefined &&
      lightModeMax !== undefined
    ) {
      const v = Number(lightModeParam.value);
      if (v === lightModeMax) return WHITE_TAB;
      if (v === lightModeMin) return COLOR_TAB;
    }
    return COLOR_TAB;
  };

  // State - default tab from light mode when available, else color if HSV exists
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const didSyncTabFromDevice = useRef(false);

  /** One-time sync when params first expose light mode (e.g. after navigation). */
  useEffect(() => {
    if (
      !supportsColor ||
      !lightModeParam ||
      lightModeMin === undefined ||
      lightModeMax === undefined ||
      didSyncTabFromDevice.current
    ) {
      return;
    }
    const v = lightModeParam.value;
    if (v === undefined || v === null) return;
    const n = Number(v);
    if (n === lightModeMax) setActiveTab(WHITE_TAB);
    else if (n === lightModeMin) setActiveTab(COLOR_TAB);
    didSyncTabFromDevice.current = true;
  }, [
    supportsColor,
    lightModeParam,
    lightModeParam?.value,
    lightModeMin,
    lightModeMax,
  ]);

  const setLightModeForTab = async (tab: Tab) => {
    const nextVal = lightModeValueForTab(tab);
    if (
      nextVal === null ||
      !device ||
      !lightModeParam ||
      Number(lightModeParam.value) === nextVal
    ) {
      return;
    }
    try {
      await lightModeParam.setValue(nextVal);
      lightModeParam.value = nextVal;
    } catch (e) {
      console.error("[Light] setLightModeForTab failed:", e);
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    void setLightModeForTab(tab);
  };

  // Handlers
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const params = await device?.getParams();
      if (device && params) {
        device.params = params;
      }
    } catch {
      toast.showError(
        t("layout.shared.errorHeader"),
        t("device.errors.failedToRefreshDeviceState"),
      );
    } finally {
      setRefreshing(false);
    }
  };

  const renderTab = (tab: Tab) => (
    <TouchableOpacity
      key={tab}
      style={[styles.tab, activeTab === tab && styles.activeTab]}
      {...testProps(`button_light_${tab.toLowerCase()}`)}
      onPress={() => handleTabChange(tab)}
    >
      <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
        {tab === WHITE_TAB
          ? t("device.panels.light.whiteTab")
          : t("device.panels.light.colorTab")}
      </Text>
    </TouchableOpacity>
  );
  
  if (device?.params?.length === 0) {
    return <DevicePanelNoParamsEmptyState />;
  }

  // Render
  return (
    <View
      style={[
        styles.container,
        { opacity: isConnected ? 1 : 0.5 },
        { backgroundColor: tokens.colors.bg5 },
      ]}
      {...testProps("view_light")}
    >
      {/* Only show tabs if there are multiple modes available */}
      {supportsColor && (
        <View style={styles.tabContainer} {...testProps("view_tabs_light")}>
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
        {...testProps("scroll_light")}
      >
        {/* Power Control */}
        {powerParam && (
          <View
            style={styles.powerButtonContainer}
            {...testProps("view_power_light")}
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
          </View>
        )}

        {/* White Mode Controls */}
        {(activeTab === WHITE_TAB || !supportsColor) && (
          <>
            {brightnessParam && (
              <ParamControlWrap
                key={brightnessParam.name}
                param={brightnessParam}
                disabled={!isConnected}
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
                disabled={!isConnected}
                setUpdating={(s) => {
                  setScrollEnabled(!s);
                }}
                style={styles.paramControlWrap}
              >
                <ColorTemperatureSlider />
              </ParamControlWrap>
            )}
            {cctParam && (
              <ParamControlWrap
                key={cctParam.name}
                param={cctParam}
                disabled={!isConnected}
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
                disabled={!isConnected}
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
                disabled={!isConnected}
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
                disabled={!isConnected}
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
    gap: 0,
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
