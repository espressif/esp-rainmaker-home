/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, TouchableOpacity } from "react-native";
import { testProps } from "@shared/utils/testProps";
import { useTranslation } from "react-i18next";

import { ScreenWrapper, Header } from "@shared/components";
import { globalStyles } from "@shared/theme/globalStyleSheet";

export interface ConfigScanErrorViewProps {
  title: string;
  errorMessage: string;
  onRetry: () => void;
  onCancel: () => void;
}

/**
 * Renders the config scan error view UI section.
 */
export function ConfigScanErrorView({
  title,
  errorMessage,
  onRetry,
  onCancel,
}: ConfigScanErrorViewProps) {
  const { t } = useTranslation();

  return (
    <ScreenWrapper {...testProps("screen_wrapper_config_scan")} style={globalStyles.configScanNoPadding}>
      <Header label={title} showBack onBackPress={onCancel} />
      <View {...testProps("view_config_scan")} style={globalStyles.configScanCenterContent}>
        <Text {...testProps("text_config_scan_error")} style={globalStyles.configScanErrorText}>{errorMessage}</Text>
        <View style={globalStyles.configScanButtonRow}>
          {/* Retry Button */}
          <TouchableOpacity
            {...testProps("button_config_scan_retry")}
            style={globalStyles.configScanButton}
            onPress={onRetry}
          >
            <Text style={globalStyles.configScanButtonText}>
              {t("config.scan.retry")}
            </Text>
          </TouchableOpacity>
          {/* Cancel Button */}
          <TouchableOpacity
            {...testProps("button_config_scan_cancel")}
            style={[
              globalStyles.configScanButton,
              globalStyles.configScanCancelButton,
            ]}
            onPress={onCancel}
          >
            <Text style={globalStyles.configScanButtonText}>
              {t("config.scan.cancel")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  );
}
