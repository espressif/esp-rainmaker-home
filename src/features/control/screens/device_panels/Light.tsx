/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

// Styles
import { tokens } from "@shared/theme/tokens";

// Hooks
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
import {
  filterUnsupportedMatterColorParams,
  getParamRole,
} from "@shared/utils/paramUtils";

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
 *
 * Serves every light stack from one panel: params are matched by the role
 * `params.config` declares for them, not by which stack produced them. Pure
 * Matter lights have no light-mode param, so tab state follows HS presence.
 *
 * Content-only (no nested ScrollView): Control owns the shared scroll + pull-to-refresh.
 * @param props - Node, device, and optional parent scroll lock callback
 * @returns Tabbed light UI (white/color) with ParamControls for power, level, and color
 */
const Light: React.FC<ControlPanelProps> = ({
  node,
  device,
  setScrollEnabled,
}) => {
  const { t } = useTranslation();

  /**
   * Locks Control's shared ScrollView while a slider/gesture is active.
   * @param updating - True while the param control is being dragged
   */
  const onSetUpdating = (updating: boolean) => {
    setScrollEnabled?.(!updating);
  };

  // Colour params the device cannot back are dropped before the lookups.
  const params = filterUnsupportedMatterColorParams(node, device?.params ?? []);

  const powerParam = params.find(
    (param) => getParamRole(param) === ESPRM_POWER_PARAM_TYPE,
  );

  const brightnessParam = params.find(
    (param) => getParamRole(param) === ESPRM_BRIGHTNESS_PARAM_TYPE,
  );

  const hueParam = params.find(
    (param) => getParamRole(param) === ESPRM_HUE_PARAM_TYPE,
  );

  const saturationParam = params.find(
    (param) => getParamRole(param) === ESPRM_SATURATION_PARAM_TYPE,
  );

  const temperatureParam = params.find(
    (param) => param.type === ESPRM_TEMPERATURE_PARAM_TYPE,
  );

  const cctParam = params.find(
    (param) => getParamRole(param) === ESPRM_CCT_PARAM_TYPE,
  );

  const lightModeParam = params.find(
    (param) => param.type === ESPRM_LIGHT_MODE_PARAM_TYPE,
  );

  // Check if device supports color (has both hue and saturation)
  const supportsColor = !!(hueParam && saturationParam);

  const lightModeBounds = lightModeParam?.bounds as
    | {
        min?: number;
        max?: number;
      }
    | undefined;
  const lightModeMin =
    typeof lightModeBounds?.min === "number" ? lightModeBounds.min : undefined;
  const lightModeMax =
    typeof lightModeBounds?.max === "number" ? lightModeBounds.max : undefined;

  /**
   * Maps White / Color tab to the light-mode param value from device bounds.
   * @param tab - Active light mode tab
   * @returns Bound value for the tab, or null when bounds are missing
   */
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

  /**
   * Initial tab from light-mode when available, else Color when HSV exists.
   * @returns Default White or Color tab
   */
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

  /** Colour mode on a real hue/sat edit; selecting a tab must not change the light. */
  const ensureColorLightMode = async () => {
    const nextVal = lightModeValueForTab(COLOR_TAB);
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
      console.error("[Light] ensureColorLightMode failed:", e);
    }
  };

  /**
   * Renders one White / Color tab button.
   * @param tab - Tab id
   * @returns Tab touchable
   */
  const renderTab = (tab: Tab) => (
    <TouchableOpacity
      key={tab}
      style={[styles.tab, activeTab === tab && styles.activeTab]}
      {...testProps(`button_light_${tab.toLowerCase()}`)}
      onPress={() => setActiveTab(tab)}
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
      style={[styles.container, { backgroundColor: tokens.colors.bg5 }]}
      {...testProps("view_light")}
    >
      {/* Only show tabs if there are multiple modes available */}
      {supportsColor && (
        <View style={styles.tabContainer} {...testProps("view_tabs_light")}>
          {([WHITE_TAB, COLOR_TAB] as Tab[]).map(renderTab)}
        </View>
      )}

      <View style={styles.content} {...testProps("scroll_light")}>
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
              setUpdating={onSetUpdating}
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
                setUpdating={onSetUpdating}
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
                setUpdating={onSetUpdating}
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
                setUpdating={onSetUpdating}
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
                setUpdating={onSetUpdating}
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
                setUpdating={onSetUpdating}
                onUserEdit={() => void ensureColorLightMode()}
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
                setUpdating={onSetUpdating}
                onUserEdit={() => void ensureColorLightMode()}
                style={styles.paramControlWrap}
              >
                <SaturationSlider />
              </ParamControlWrap>
            )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  paramControlWrap: {
    width: "100%",
  },
  container: {
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
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._10,
    borderRadius: tokens.radius.md,
    alignItems: "center",
  },
  powerButtonContainer: {
    maxHeight: 200,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default observer(Light);
