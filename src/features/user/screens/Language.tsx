/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Header, InfoBanner, ScreenWrapper } from "@shared/components";
import { SettingsSection } from "@features/user/components";
import { useLanguage } from "@features/user/hooks";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

/**
 * Renders the language selection UI section. Lets the user pick "System
 * default" (follow device locale), English, or Simplified Chinese; the
 * selection is persisted by `useLanguage` and applied to i18next immediately.
 */
const Language: React.FC = () => {
  const { t } = useTranslation();
  const { selection, options, setLanguage, isUpdating } = useLanguage();

  return (
    <>
      <Header
        label={t("user.language.title")}
        showBack={true}
        qaId="header_language"
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_language"
      >
        <InfoBanner
          message={t("user.language.helper")}
          containerStyle={styles.helperBanner}
          qaId="banner_language_helper"
        />
        <SettingsSection qaId="section_language">
          {options.map((option, index) => {
            const qaId = `item_language_${option.value}`;
            const isSelected = option.value === selection;
            const isLast = index === options.length - 1;
            return (
              <Pressable
                key={option.value}
                {...testProps(`button_${qaId}`)}
                disabled={isUpdating}
                onPress={() => {
                  void setLanguage(option.value);
                }}
              >
                <View
                  style={globalStyles.settingsItem}
                  {...testProps(`view_${qaId}`)}
                >
                  <View style={globalStyles.settingsItemLeft}>
                    <Text
                      {...testProps(`text_${qaId}`)}
                      style={globalStyles.settingsItemText}
                    >
                      {t(option.labelKey)}
                    </Text>
                  </View>
                  {isSelected && (
                    <Check
                      {...testProps(`${qaId}_check`)}
                      size={20}
                      color={tokens.colors.primary}
                    />
                  )}
                </View>
                {!isLast && <View style={globalStyles.settingsItemSeparator} />}
              </Pressable>
            );
          })}
        </SettingsSection>
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  helperBanner: {
    marginBottom: tokens.spacing._15,
  },
});

export { Language };
