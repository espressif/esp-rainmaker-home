/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { BarChart2, TrendingUp } from "lucide-react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
import type { GenericChartProps } from "@/types/global";

type ChartType = GenericChartProps["type"];

type ChartTypeToggleProps = {
  chartType: ChartType;
  loading: boolean;
  onChange: (type: ChartType) => void;
};

const ChartTypeToggle = ({
  chartType,
  loading,
  onChange,
}: ChartTypeToggleProps) => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.chartTypeSectionContainer}>
      <Text style={globalStyles.sectionLabelSecondary}>
        {t("device.chart.types")}
      </Text>

      <View style={globalStyles.chartTypeSection}>
        <TouchableOpacity
          disabled={loading}
          style={[
            globalStyles.iconButton,
            chartType === "bar" && globalStyles.iconButtonActive,
            loading && globalStyles.iconButtonDisabled,
          ]}
          onPress={() => onChange("bar")}
        >
          <BarChart2
            size={20}
            color={
              chartType === "bar"
                ? tokens.colors.white
                : tokens.colors.text_secondary
            }
          />
        </TouchableOpacity>

        <TouchableOpacity
          disabled={loading}
          style={[
            globalStyles.iconButton,
            chartType === "line" && globalStyles.iconButtonActive,
            loading && globalStyles.iconButtonDisabled,
          ]}
          onPress={() => onChange("line")}
        >
          <TrendingUp
            size={20}
            color={
              chartType === "line"
                ? tokens.colors.white
                : tokens.colors.text_secondary
            }
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ChartTypeToggle;

