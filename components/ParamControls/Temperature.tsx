/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  View,
  Text,
  TouchableOpacity,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { paramControlStyles as styles } from "./lib/styles";

// Icons
import { ChartNoAxesCombined } from "lucide-react-native";

// Types
import { ParamControlChildProps } from "./lib/types";
import { observer } from "mobx-react-lite";

/**
 * Temperature
 *
 * A temperature display component that shows the temperature value.
 * On click, opens the chart for time series visualization.
 *
 * @param param - The parameter object containing value and setValue function
 * @param disabled - Optional flag to disable the control
 * @returns JSX component
 */
const Temperature = observer(
  ({ label, value, onOpenChart, disabled }: ParamControlChildProps) => {
    // Handlers
    const handlePress = () => {
      if (disabled) return;
      if (onOpenChart) {
        onOpenChart();
      }
    };

    // Format temperature value with unit
    const formatTemperature = (val: any): string => {
      if (val === null || val === undefined) return "N/A";
      return `${val}°C`;
    };

    // Render
    return (
      <TouchableOpacity
        style={[styles.container]}
        onPress={handlePress}
        disabled={disabled}
      >
        <View style={styles.content}>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{label}</Text>
            <Text style={styles.value} numberOfLines={1}>
              {formatTemperature(value)}
            </Text>
          </View>
          <ChartNoAxesCombined size={20} color={tokens.colors.gray} />
        </View>
      </TouchableOpacity>
    );
  }
);

export default Temperature;
