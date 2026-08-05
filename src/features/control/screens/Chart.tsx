/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

// Components
import { Header } from "@shared/components";
import {
  ChartFootnotes,
  ChartMessage,
  ChartSummaryHeader,
  GranularityTabs,
  TimeSeriesBarChart,
} from "@features/control/components";

// Hooks
import { useTimeSeriesChart } from "@features/control/hooks";

// Utils
import { formatChartValue } from "@features/control/utils/timeSeriesFormat";
import { CHART_STATE_READY } from "@features/control/constants";

// Styles
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Types
import type { ChartState } from "@src/types/global";

/**
 * Time-series chart screen (revamped design): Daily / Weekly / Monthly tabs,
 * a paged window summary, a tap-to-inspect bar chart, and footnotes. Works
 * for both `time_series` and `simple_ts` params via useTimeSeriesChart.
 */
const Chart = () => {
  const { t } = useTranslation();
  const { nodeId, deviceName, paramName } = useLocalSearchParams<{
    nodeId?: string;
    deviceName?: string;
    paramName?: string;
  }>();

  const {
    title,
    granularity,
    buckets,
    summary,
    unit,
    rangeLabel,
    chartState,
    chartStateLabelMap,
    loading,
    canGoNext,
    selectedIndex,
    labelEveryNth,
    onSelectGranularity,
    onPreviousWindow,
    onNextWindow,
    onSelectBar,
  } = useTimeSeriesChart({ nodeId, deviceName, paramName });

  return (
    <>
      <Header
        label={title}
        showBack={true}
        rightSlot={<View style={globalStyles.headerSpacer} />}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={globalStyles.chartScreenContent}
      >
        <GranularityTabs
          selected={granularity}
          disabled={loading}
          onSelect={onSelectGranularity}
        />

        <ChartSummaryHeader
          valueLabel={formatChartValue(
            summary.value,
            unit,
            t("device.chart.noValue")
          )}
          rangeLabel={rangeLabel}
          canGoNext={canGoNext}
          disabled={loading}
          onPrevious={onPreviousWindow}
          onNext={onNextWindow}
        />

        {chartState === CHART_STATE_READY ? (
          <TimeSeriesBarChart
            buckets={buckets}
            unit={unit}
            selectedIndex={selectedIndex}
            onSelectBar={onSelectBar}
            labelEveryNth={labelEveryNth}
          />
        ) : (
          <ChartMessage
            text={chartStateLabelMap[chartState as Exclude<ChartState, "ready">]}
          />
        )}

        <ChartFootnotes />
      </ScrollView>
    </>
  );
};

export default Chart;
