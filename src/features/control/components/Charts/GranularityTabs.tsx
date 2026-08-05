/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";

import { CHART_GRANULARITIES } from "@features/control/constants";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import type { GranularityTabsProps } from "@src/types/global";

/**
 * Daily / Weekly / Monthly tab bar of the chart screen. The active tab is
 * emphasized with a primary underline, per the revamp design.
 */
const GranularityTabs: React.FC<GranularityTabsProps> = ({
  selected,
  disabled = false,
  onSelect,
}) => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.granularityTabs}>
      {CHART_GRANULARITIES.map((granularity) => {
        const isActive = granularity === selected;
        return (
          <TouchableOpacity
            key={granularity}
            style={globalStyles.granularityTab}
            onPress={() => onSelect(granularity)}
            disabled={disabled || isActive}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                globalStyles.granularityTabText,
                isActive && globalStyles.granularityTabTextActive,
              ]}
            >
              {t(`device.chart.tabs.${granularity}`)}
            </Text>
            {isActive && <View style={globalStyles.granularityTabIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default GranularityTabs;
