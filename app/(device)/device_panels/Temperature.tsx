/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
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
  Dimensions,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";

// Hooks
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

// State Management
import { observer } from "mobx-react-lite";

// Types
import { ControlPanelProps } from "@/types/global";

// Constants
import { ESPRM_TEMPERATURE_PARAM_TYPE } from "@/utils/constants";

// Components
import { RoundedSlider } from "@/components/Layout/RoundedSlider";

// Utils
import { testProps } from "@/utils/testProps";

/**
 * Temperature Sensor Control Panel
 *
 * A simple control panel for temperature sensor devices that displays:
 * - Current temperature reading with segmented circular gauge
 * - Read-only temperature display
 *
 * @param node - The ESPRMNode representing the temperature sensor
 * @param device - The ESPRMDevice representing the temperature sensor
 * @returns JSX component for temperature sensor display
 */
const Temperature: React.FC<ControlPanelProps> = ({ node, device }) => {
  // Hooks
  const toast = useToast();
  const { t } = useTranslation();

  // State
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, _] = useState(true);

  // Computed Values
  const isConnected = node.connectivityStatus?.isConnected || false;

  // Device Parameters - Look for temperature parameter
  const temperatureParam = device?.params?.find(
    (param) =>
      param.type === ESPRM_TEMPERATURE_PARAM_TYPE ||
      param.name === "Temperature" ||
      param.name === "temperature" ||
      param.name === "temp"
  );

  // Get current temperature value
  const temperature = temperatureParam?.value || "";

  // Get temperature colors
  const getTemperatureColors = (temp: number) => {
    // Colors for temperature segments
    return {
      fillColor: "#EC4899", // Pink
      emptyColor: "#E5E7EB", // Light gray
    };
  };

  const colors = getTemperatureColors(temperature);

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

  const getTemperaturePercentage = (temperature: number) => {
    const minTemp = -2; // Coldest temperature (5%)
    const maxTemp = 60; // Hottest temperature (100%)
    const minPercentage = 5; // Minimum percentage for coldest temp
    const maxPercentage = 100; // Maximum percentage for hottest temp

    // Clamp temperature to the range
    const clampedTemp = Math.max(minTemp, Math.min(maxTemp, temperature));

    // Calculate percentage
    const tempRange = maxTemp - minTemp;
    const percentageRange = maxPercentage - minPercentage;

    if (tempRange === 0) return minPercentage; // Avoid division by zero

    const percentage =
      minPercentage + ((clampedTemp - minTemp) / tempRange) * percentageRange;

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
    const centerContentSize = progressBarSize * 0.55;

    return {
      radius: Math.round(progressBarRadius),
      size: Math.round(progressBarSize),
      centerContentSize: Math.round(centerContentSize),
    };
  }, []);

  // Render
  return (
    <View style={[styles.container, { opacity: isConnected ? 1 : 0.5 }]} {...testProps("view_temperature")}>
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
        } {...testProps("scroll_temperature")}
      >
        {/* Temperature Display */}
        <View style={styles.temperatureContainer} {...testProps("view_temperature")}>
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
              ]} {...testProps("view_temperature")}
            >
              <View style={styles.temperatureDisplay} {...testProps("view_temperature")}>
                <Text style={styles.temperatureLabel} {...testProps("text_temperature")}>{temperature}</Text>
                <Text style={styles.degreeSymbol} {...testProps("text_degree")}>°</Text>
                <Text style={styles.temperatureUnit} {...testProps("text_unit")}>C</Text>
              </View>
              <Text style={styles.temperatureTitle} {...testProps("text_temperature_title")}>
                {t("device.panels.temperature.title")}
              </Text>
            </View>
          </RoundedSlider>
        </View>
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
    backgroundColor: tokens.colors.bg5,
    padding: tokens.spacing._20,
    borderRadius: tokens.radius.md,
  },
  contentContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
    paddingVertical: tokens.spacing._20,
  },
  temperatureContainer: {
    flex: 1,
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
  autoCoolingButton: {
    backgroundColor: tokens.colors.primary,
    paddingVertical: tokens.spacing._5,
    paddingHorizontal: tokens.spacing._15,
    borderRadius: tokens.radius.sm,
    marginTop: tokens.spacing._10,
  },
  autoCoolingText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontWeight: "600",
  },
  degreeSymbol: {
    fontSize: 15,
    fontWeight: "700",
    color: tokens.colors.black,
    lineHeight: 15,
    marginTop: 2,
  },
  degreeContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  temperatureDisplay: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
  },
});

export default observer(Temperature);
