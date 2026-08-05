/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { Keyboard, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import { getDisplayVersion } from "@shared/utils/appVersion";
import { getActiveRegionLabelKey } from "@config/region.config";

interface AppVersionTextProps {
  testId?: string;
}

/**
 * Renders the app version text UI section.
 * Hidden while the keyboard is open so it does not crowd input fields.
 *
 * @param testId - Optional test id for the version text element.
 */
export function AppVersionText({ testId = "text_app_version" }: AppVersionTextProps) {
  const { t } = useTranslation();
  const appVersion = getDisplayVersion();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setIsKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (isKeyboardVisible) {
    return null;
  }

  return (
    <Text {...testProps(testId)} style={globalStyles.versionText}>
      {t("layout.shared.version")} {appVersion} · {t(getActiveRegionLabelKey())}
    </Text>
  );
}
