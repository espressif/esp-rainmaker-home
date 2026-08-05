/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import type { ChartSummaryHeaderProps } from "@src/types/global";

/**
 * Window summary above the chart: the aggregated value in large type, the
 * window range label underneath, and chevrons that page the window back and
 * forward in time (forward is disabled on the newest window).
 */
const ChartSummaryHeader: React.FC<ChartSummaryHeaderProps> = ({
  valueLabel,
  rangeLabel,
  canGoNext,
  disabled = false,
  onPrevious,
  onNext,
}) => (
  <View style={globalStyles.summaryHeader}>
    <TouchableOpacity
      style={globalStyles.summaryPagerButton}
      onPress={onPrevious}
      disabled={disabled}
      accessibilityRole="button"
    >
      <ChevronLeft
        size={tokens.iconSize._20}
        color={disabled ? tokens.colors.gray : tokens.colors.text_primary}
      />
    </TouchableOpacity>

    <View style={globalStyles.summaryTextBlock}>
      <Text style={globalStyles.summaryValueText}>{valueLabel}</Text>
      <Text style={globalStyles.summaryRangeText}>{rangeLabel}</Text>
    </View>

    <TouchableOpacity
      style={globalStyles.summaryPagerButton}
      onPress={onNext}
      disabled={disabled || !canGoNext}
      accessibilityRole="button"
    >
      <ChevronRight
        size={tokens.iconSize._20}
        color={
          disabled || !canGoNext ? tokens.colors.gray : tokens.colors.text_primary
        }
      />
    </TouchableOpacity>
  </View>
);

export default ChartSummaryHeader;
