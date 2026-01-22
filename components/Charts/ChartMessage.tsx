/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text } from "react-native";

import { globalStyles } from "@/theme/globalStyleSheet";
import type { ChartMessageProps } from "@/types/global";

const ChartMessage: React.FC<ChartMessageProps> = ({ text }) => (
  <View style={globalStyles.chartEmptyStateContainer}>
    <Text style={globalStyles.chartEmptyStateText}>{text}</Text>
  </View>
);

export default ChartMessage;

