/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { View, StyleSheet, Text, Dimensions } from "react-native";

// Styles
import { tokens } from "@shared/theme/tokens";

// Hooks
import { useTranslation } from "react-i18next";

// State Management
import { observer } from "mobx-react-lite";

// Types
import { ControlPanelProps } from "@src/types/global";

// Constants
import { ESPRM_TEMPERATURE_PARAM_TYPE } from "@shared/utils/constants";

// Components
import {
  RoundedSlider,
  DevicePanelNoParamsEmptyState,
} from "@features/control/components";

// Utils
import { testProps } from "@shared/utils/testProps";

/**
 * Temperature Sensor Control Panel
 *
 * A simple control panel for temperature sensor devices that displays:
 * - Current temperature reading with segmented circular gauge
 * - Read-only temperature display
 *
 * Content-only (no nested ScrollView): Control owns the shared scroll + pull-to-refresh.
 * @param props - Node and device for the temperature sensor
 * @returns Gauge and current reading for the temperature device
 */
const Temperature: React.FC<ControlPanelProps> = ({ node, device }) => {
  const { t } = useTranslation();

  // Computed Values
  const isConnected = node.connectivityStatus?.isConnected || false;

  // Device Parameters - Look for temperature parameter
  const temperatureParam = device?.params?.find(
    (param) =>
      param.type === ESPRM_TEMPERATURE_PARAM_TYPE ||
      param.name === "Temperature" ||
      param.name === "temperature" ||
      param.name === "temp",
  );

  // Get current temperature value
  const temperature = temperatureParam?.value || "";

  /**
   * Segment colors for the temperature gauge.
   * @param _temp - Current temperature (unused; palette is fixed)
   * @returns Fill and empty segment colors
   */
  const getTemperatureColors = (_temp: number) => {
    return {
      fillColor: "#EC4899", // Pink
      emptyColor: "#E5E7EB", // Light gray
    };
  };

  const colors = getTemperatureColors(temperature);

  /**
   * Maps a temperature reading onto the circular gauge percentage range.
   * @param temperatureValue - Celsius reading
   * @returns Percentage for the gauge (5–100)
   */
  const getTemperaturePercentage = (temperatureValue: number) => {
    const minTemp = -2; // Coldest temperature (5%)
    const maxTemp = 60; // Hottest temperature (100%)
    const minPercentage = 5; // Minimum percentage for coldest temp
    const maxPercentage = 100; // Maximum percentage for hottest temp

    // Clamp temperature to the range
    const clampedTemp = Math.max(
      minTemp,
      Math.min(maxTemp, temperatureValue),
    );

    // Calculate percentage
    const tempRange = maxTemp - minTemp;
    const percentageRange = maxPercentage - minPercentage;

    if (tempRange === 0) return minPercentage; // Avoid division by zero

    const percentage =
      minPercentage +
      ((clampedTemp - minTemp) / tempRange) * percentageRange;

    return Math.round(percentage);
  };

  const { radius, size, centerContentSize } = useMemo(() => {
    const screenWidth = Math.min(Dimensions.get("window").width, 500);
    const screenHeight = Math.max(Dimensions.get("window").height, 500);

    // Use the smaller dimension to ensure it fits on screen
    const minDimension = Math.min(screenWidth, screenHeight);

    // Calculate size with 15% margin
    const margin = minDimension * 0.05;
    const availableSize = minDimension - margin * 2;

    // Size for the progress bar
    const progressBarSize = availableSize;

    // Radius is 40% of the size
    const progressBarRadius = progressBarSize * 0.4;

    // Center content size is 50% of the size
    const centerContentSizeValue = progressBarSize * 0.55;

    return {
      radius: Math.round(progressBarRadius),
      size: Math.round(progressBarSize),
      centerContentSize: Math.round(centerContentSizeValue),
    };
  }, []);

  if (device?.params?.length === 0) {
    return <DevicePanelNoParamsEmptyState />;
  }

  // Render
  return (
    <View
      style={[styles.container, { opacity: isConnected ? 1 : 0.5 }]}
      {...testProps("view_temperature")}
    >
      <View style={styles.content} {...testProps("scroll_temperature")}>
        {/* Temperature Display */}
        <View
          style={styles.temperatureContainer}
          {...testProps("view_temperature")}
        >
          <RoundedSlider
            progress={getTemperaturePercentage(temperature)}
            progressLabel={temperature}
            segments={70}
            height={3}
            fillColor={colors.fillColor}
            emptyColor={colors.emptyColor}
            showPercentage={false}
            shape="circular"
            radius={radius}
            startAngle={155}
            arcAngle={235}
            size={size}
            unit={t("device.panels.temperature.unit")}
            label={t("device.panels.temperature.title").toUpperCase()}
            tickWidth={40}
            useGradient={true}
            gradientColors={[
              "#00B4F0", // Blue (cold)
              "#A6D7F7", // Light blue
              "#FFD966", // Yellow (warm)
              "#F68C1F", // Orange (hot)
              "#F44336", // Red (very hot)
            ]}
          >
            <View
              style={[
                styles.centerContent,
                { width: centerContentSize, height: centerContentSize },
              ]}
              {...testProps("view_temperature")}
            >
              <View
                style={styles.temperatureDisplay}
                {...testProps("view_temperature")}
              >
                <Text
                  style={styles.temperatureLabel}
                  {...testProps("text_temperature")}
                >
                  {temperature}
                </Text>
                <Text style={styles.degreeSymbol} {...testProps("text_degree")}>
                  °
                </Text>
                <Text
                  style={styles.temperatureUnit}
                  {...testProps("text_unit")}
                >
                  C
                </Text>
              </View>
              <Text
                style={styles.temperatureTitle}
                {...testProps("text_temperature_title")}
              >
                {t("device.panels.temperature.title")}
              </Text>
            </View>
          </RoundedSlider>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.bg5,
  },
  content: {
    backgroundColor: tokens.colors.bg5,
    padding: tokens.spacing._20,
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: tokens.spacing._20,
  },
  temperatureContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._20,
  },
  temperatureLabel: {
    fontSize: 48,
    fontWeight: "700",
    color: tokens.colors.black,
    lineHeight: 52,
    textAlign: "center",
  },
  temperatureUnit: {
    fontSize: 15,
    fontWeight: "400",
    color: tokens.colors.black,
    lineHeight: 15,
    marginTop: 2,
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: tokens.spacing._20,
    backgroundColor: tokens.colors.white,
    borderRadius: 100,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  temperatureTitle: {
    fontSize: tokens.fontSize.md,
    fontWeight: "600",
    color: tokens.colors.gray,
  },
  degreeSymbol: {
    fontSize: 15,
    fontWeight: "700",
    color: tokens.colors.black,
    lineHeight: 15,
    marginTop: 2,
  },
  temperatureDisplay: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
  },
});

export default observer(Temperature);
