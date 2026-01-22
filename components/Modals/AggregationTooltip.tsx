/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
} from "react-native";

// Types
import { AggregationTooltipProps } from "@/types/global";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";

/**
 * AggregationTooltip
 *
 * A compact tooltip component for aggregation type selection.
 * Features:
 * - Aggregation selection list
 * - Selected aggregation indication
 * - Positioned tooltip with arrow
 * - Small and compact design
 */
const AggregationTooltip: React.FC<AggregationTooltipProps> = ({
  visible,
  onClose,
  anchorPosition,
  aggregations,
  onSelectAggregation,
  selectedAggregation,
}) => {
  if (!visible) return null;

  // Helper function to capitalize first letter
  const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Render helpers
  const renderAggregationOption = (agg: string, index: number) => {
    const isSelected = selectedAggregation === agg;
    const isLast = index === aggregations.length - 1;

    const handleSelect = () => {
      onSelectAggregation(agg);
      onClose();
    };

    return (
      <TouchableOpacity
        onPress={handleSelect}
        style={[
          globalStyles.aggregationTooltipMenuItem,
          isSelected && globalStyles.aggregationTooltipSelectedMenuItem,
          isLast && globalStyles.aggregationTooltipLastMenuItem,
        ]}
        key={`agg-${agg}-${index}`}
      >
        <Text
          style={[
            globalStyles.aggregationTooltipMenuText,
            isSelected && globalStyles.aggregationTooltipSelectedMenuItemText,
          ]}
        >
          {capitalizeFirstLetter(agg)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <TouchableOpacity style={globalStyles.aggregationTooltipOverlay} onPress={onClose}>
      <View
        style={[
          globalStyles.aggregationTooltipContainer,
          anchorPosition && {
            position: "absolute",
            top: anchorPosition.y || 0,
            right: anchorPosition.x || 10,
          },
        ]}
      >
        <View style={globalStyles.aggregationTooltipArrow} />
        <View style={globalStyles.aggregationTooltipScrollContainer}>
          {aggregations.map((agg, index) => renderAggregationOption(agg, index))}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default AggregationTooltip;

