/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import { getActiveRegionLabelKey } from "@config/region.config";

interface AppVersionTextProps {
  testId?: string;
}

/**
 * Renders the app version text UI section.
 */
export function AppVersionText({ testId = "text_app_version" }: AppVersionTextProps) {
  const { t } = useTranslation();
  const appVersion = Constants.expoConfig?.version;

  return (
    <Text {...testProps(testId)} style={globalStyles.versionText}>
      {t("layout.shared.version")} {appVersion} · {t(getActiveRegionLabelKey())}
    </Text>
  );
}
