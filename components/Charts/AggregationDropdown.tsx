/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from "react";
import { TouchableOpacity, Dimensions } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { useTranslation } from "react-i18next";

// Components
import AggregationTooltip from "@/components/Modals/AggregationTooltip";
import { BadgeText } from "@/components";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
import type { AggregationDropdownProps } from "@/types/global";

/**
 * AggregationDropdown
 *
 * Renders the aggregation selection button and tooltip for chart aggregation methods.
 * Logic is kept identical to the inline implementation in Chart.tsx.
 */
const AggregationDropdown: React.FC<AggregationDropdownProps> = ({
  aggregation,
  aggregations,
  loading,
  tooltipVisible,
  tooltipPosition,
  setTooltipVisible,
  setTooltipPosition,
  buttonRef,
  chartContainerRef,
  onSelectAggregation,
}) => {
  const { t } = useTranslation();

  /**
   * Handle aggregation dropdown button press
   * Calculates tooltip position relative to button and screen
   */
  const handleAggregationDropdownPress = useCallback(() => {
    if (buttonRef.current && chartContainerRef.current) {
      buttonRef.current.measureLayout(
        chartContainerRef.current,
        (x: number, y: number, width: number, height: number) => {
          const { width: screenWidth } = Dimensions.get("window");
          chartContainerRef.current?.measure(
            (
              _fx: number,
              _fy: number,
              _fwidth: number,
              _fheight: number,
              px: number,
              py: number
            ) => {
              const buttonAbsoluteX = px + x;
              const buttonAbsoluteY = py + y;
              const tooltipX = screenWidth - buttonAbsoluteX - width;
              const tooltipY = buttonAbsoluteY + height + 5;
              setTooltipPosition({ x: tooltipX, y: tooltipY });
            }
          );
        },
        () => {
          setTooltipPosition({ x: 10, y: 50 });
        }
      );
    } else {
      setTooltipPosition({ x: 10, y: 50 });
    }
    setTooltipVisible(!tooltipVisible);
  }, [buttonRef, chartContainerRef, setTooltipPosition, setTooltipVisible, tooltipVisible]);

  return (
    <TouchableOpacity
      ref={buttonRef}
      onPress={handleAggregationDropdownPress}
      disabled={loading}
      style={[
        globalStyles.badgeContainer,
        { opacity: loading ? 0.5 : 1 },
      ]}
    >
      <BadgeText>
        {t(`device.chart.aggregation.${aggregation}`)}
      </BadgeText>
      <ChevronDown size={14} color={tokens.colors.text_secondary} />

      {/* Aggregation Tooltip - Hidden for simple time series */}
      <AggregationTooltip
        visible={tooltipVisible}
        onClose={() => setTooltipVisible(false)}
        anchorPosition={tooltipPosition}
        selectedAggregation={aggregation}
        aggregations={aggregations}
        onSelectAggregation={onSelectAggregation}
      />
    </TouchableOpacity>
  );
};

export default AggregationDropdown;

