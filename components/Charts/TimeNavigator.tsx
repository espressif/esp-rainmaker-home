/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { formatTimeRangeDisplay } from "@/utils/timeSeriesHelper";
import type { TimeNavigatorProps } from "@/types/global";

/**
 * Component for navigating between time periods in a chart.
 * Displays the current time range and provides buttons to navigate to previous/next periods.
 *
 * @component
 * @param props - TimeNavigatorProps containing navigation configuration
 * @returns Rendered TimeNavigator component
 */
const TimeNavigator = ({
  period,
  offset,
  loading = false,
  onPrevious,
  onNext,
  canNavigateNext,
  label,
}: TimeNavigatorProps) => {
  // Compute display label: use provided label or derive from period/offset
  const displayLabel = useMemo(() => {
    if (label) return label;
    if (period != null && offset != null) {
      return formatTimeRangeDisplay(period, offset);
    }
    return "";
  }, [label, period, offset]);

  // Determine if next button should be disabled
  const isNextDisabled = !canNavigateNext || loading;

  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
      {/* Previous Period Button */}
      <TouchableOpacity
        onPress={onPrevious}
        disabled={loading}
        style={[
          globalStyles.timeNavigatorButton,
          loading && globalStyles.timeNavigatorButtonDisabled,
        ]}
      >
        <ChevronLeft size={20} color={tokens.colors.primary} />
      </TouchableOpacity>

      {/* Time Range Display */}
      <View style={globalStyles.timeNavigatorContent}>
        <Text style={globalStyles.timeNavigatorText}>{displayLabel}</Text>
      </View>

      {/* Next Period Button */}
      <TouchableOpacity
        onPress={onNext}
        disabled={isNextDisabled}
        style={[
          globalStyles.timeNavigatorButton,
          isNextDisabled && globalStyles.timeNavigatorButtonDisabled,
        ]}
      >
        <ChevronRight size={20} color={tokens.colors.primary} />
      </TouchableOpacity>
    </View>
  );
};

export default TimeNavigator;