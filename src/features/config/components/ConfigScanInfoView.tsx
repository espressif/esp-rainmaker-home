/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Check, QrCode } from "lucide-react-native";
import { getResolvedActiveSdk } from "@config/sdk.config";

import { runtimeConfigManager } from "@config/runtime.config";
import { ScreenWrapper, Header } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { formatConfigKey } from "@shared/utils/common";
import { testProps } from "@shared/utils/testProps";

export interface ConfigScanInfoViewProps {
  title: string;
  onUpdateConfig: () => void;
  onCancel: () => void;
  /** Base URL of the remembered private deployment, if one was configured. */
  savedDeploymentLabel?: string | null;
  /** Continue with the remembered deployment instead of scanning again. */
  onContinueWithSaved?: () => void;
}

/**
 * Renders the config scan info view UI section.
 */
export function ConfigScanInfoView({
  title,
  onUpdateConfig,
  onCancel,
  savedDeploymentLabel,
  onContinueWithSaved,
}: ConfigScanInfoViewProps) {
  const { t } = useTranslation();
  const activeSdk = getResolvedActiveSdk();
  const runtimeConfig = runtimeConfigManager.config;
  const hasSavedDeployment = !!savedDeploymentLabel && !!onContinueWithSaved;

  return (
    <ScreenWrapper {...testProps("screen_wrapper_active_sdk")} style={globalStyles.configScanNoPadding}>
      <Header label={title} showBack onBackPress={onCancel} />
      <ScrollView
        {...testProps("scroll_view_active_sdk")}
        style={globalStyles.configScanScrollContent}
        contentContainerStyle={globalStyles.configScanScrollContentContainer}
      >
        <View {...testProps("view_active_sdk")} style={globalStyles.configScanSection}>
          <Text style={globalStyles.configScanSectionTitle}>
            {t("config.scan.activeSdk")}
          </Text>
          <Text {...testProps("text_active_sdk")} style={globalStyles.configScanConfigValue}>{activeSdk}</Text>
        </View>
        <View style={globalStyles.configScanSection}>
          <Text style={globalStyles.configScanSectionTitle}>
            {t("config.scan.config")}
          </Text>
          {/* Runtime Config Table */}
          {runtimeConfig ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              style={globalStyles.configScanTableScroll}
              contentContainerStyle={globalStyles.configScanTableScrollContent}
              nestedScrollEnabled
              scrollEventThrottle={16}
              directionalLockEnabled
            >
              <TouchableWithoutFeedback
                style={globalStyles.configScanTableTouchable}
              >
                <View style={globalStyles.configScanTable}>
                  <View style={globalStyles.configScanTableHeader}>
                    <Text
                      style={[
                        globalStyles.configScanTableHeaderCell,
                        globalStyles.configScanTableCellKey,
                      ]}
                    >
                      {t("config.scan.tableKey")}
                    </Text>
                    <Text
                      style={[
                        globalStyles.configScanTableHeaderCell,
                        globalStyles.configScanTableCellValue,
                      ]}
                    >
                      {t("config.scan.tableValue")}
                    </Text>
                  </View>
                  {Object.entries(runtimeConfig).map(([key, value]) => (
                    <View key={key} style={globalStyles.configScanTableRow}>
                      <Text
                        style={[
                          globalStyles.configScanTableCell,
                          globalStyles.configScanTableCellKey,
                        ]}
                        numberOfLines={1}
                      >
                        {formatConfigKey(key)}
                      </Text>
                      <View style={globalStyles.configScanTableCellValueWrap}>
                        <Text
                          style={[
                            globalStyles.configScanTableCell,
                            globalStyles.configScanTableCellValue,
                          ]}
                        >
                          {String(value ?? "—")}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </ScrollView>
          ) : (
            <Text style={globalStyles.configScanConfigValue}>
              {t("config.scan.noRuntimeConfig")}
            </Text>
          )}
        </View>
        {/* Previously configured deployment — continue without re-scanning */}
        {hasSavedDeployment && (
          <View
            {...testProps("view_saved_deployment")}
            style={globalStyles.configScanSection}
          >
            <Text style={globalStyles.configScanSectionTitle}>
              {t("config.scan.savedDeployment")}
            </Text>
            <Text
              {...testProps("text_saved_deployment")}
              style={globalStyles.configScanConfigValue}
            >
              {savedDeploymentLabel}
            </Text>
            <TouchableOpacity
              {...testProps("button_continue_saved_config")}
              style={globalStyles.configScanUpdateButton}
              onPress={onContinueWithSaved}
            >
              <Check
                size={24}
                color={tokens.colors.white}
                style={globalStyles.configScanUpdateButtonIcon}
              />
              <Text style={globalStyles.configScanButtonText}>
                {t("config.scan.continueWithSaved")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Update Config Button — secondary once a saved deployment exists */}
        <TouchableOpacity
          {...testProps("button_update_config")}
          style={
            hasSavedDeployment
              ? globalStyles.configScanSecondaryButton
              : globalStyles.configScanUpdateButton
          }
          onPress={onUpdateConfig}
        >
          <QrCode
            size={24}
            color={
              hasSavedDeployment ? tokens.colors.primary : tokens.colors.white
            }
            style={globalStyles.configScanUpdateButtonIcon}
          />
          <Text
            style={
              hasSavedDeployment
                ? globalStyles.configScanSecondaryButtonText
                : globalStyles.configScanButtonText
            }
          >
            {hasSavedDeployment
              ? t("config.scan.scanNewConfig")
              : t("config.scan.updateConfig")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenWrapper>
  );
}
