/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { WifiOff } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

export interface HomeLoadFailedNoticeProps {
  /** Loads the home again. */
  onRetry: () => void;
  /** True while a load is running; the button is disabled meanwhile. */
  retrying: boolean;
}

/**
 * Shown above the device skeletons when the home could not be loaded (for
 * example the app started offline). It is not the "add your first device"
 * state: that one is only for a home that really has no devices.
 */
export const HomeLoadFailedNotice: React.FC<HomeLoadFailedNoticeProps> = ({
  onRetry,
  retrying,
}) => {
  const { t } = useTranslation();
  return (
    <View {...testProps("view_home_load_failed")} style={styles.container}>
      <View style={globalStyles.warningContainer}>
        <WifiOff size={tokens.fontSize.xs} color={tokens.colors.warn} />
        <Text
          {...testProps("text_home_load_failed")}
          style={[globalStyles.warningText, styles.message]}
        >
          {t("group.home.loadFailedMessage")}
        </Text>
      </View>
      <Pressable
        {...testProps("button_home_load_retry")}
        disabled={retrying}
        hitSlop={8}
        onPress={onRetry}
      >
        <Text
          style={[globalStyles.linkText, retrying && styles.retryingText]}
        >
          {t("common.retry")}
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: tokens.spacing._15,
    marginTop: tokens.spacing._10,
  },
  message: {
    flex: 1,
  },
  retryingText: {
    color: tokens.colors.gray,
  },
});
