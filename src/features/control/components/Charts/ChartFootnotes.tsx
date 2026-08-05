/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { globalStyles } from "@shared/theme/globalStyleSheet";

/**
 * Pro Tip and Disclaimer footnotes shown under the chart, per the revamp
 * design. Copy comes from i18n; the component takes no props.
 */
const ChartFootnotes: React.FC = () => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.footnotesContainer}>
      <Text style={globalStyles.footnoteText}>
        <Text style={globalStyles.footnoteLabel}>
          {t("device.chart.proTipLabel")}
        </Text>{" "}
        {t("device.chart.proTipText")}
      </Text>
      <Text style={globalStyles.footnoteText}>
        <Text style={globalStyles.footnoteLabel}>
          {t("device.chart.disclaimerLabel")}
        </Text>{" "}
        {t("device.chart.disclaimerText")}
      </Text>
    </View>
  );
};

export default ChartFootnotes;
