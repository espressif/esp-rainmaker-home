/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { WEBSITE_LINK } from "@shared/utils/constants";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { useTranslation } from "react-i18next";
import {
  Header,
  ContentWrapper,
  ScreenWrapper,
  Logo,
} from "@shared/components";
import { InfoItem } from "@features/user/components";
import { getActiveRegionLabelKey } from "@config/region.config";
import { getDisplayVersion } from "@shared/utils/appVersion";

/**
 * Renders the about us UI section.
 */
const AboutUs: React.FC = () => {
  const { t } = useTranslation();
  const appVersion = getDisplayVersion();

  const handleWebsiteClick = async () => {
    try {
      await WebBrowser.openBrowserAsync(WEBSITE_LINK);
    } catch (error) {
      console.error("Failed to open URL:", error);
    }
  };

  return (
    <>
      <Header
        label={t("user.aboutUs.title")}
        showBack={true}
        qaId="header_about_us"
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_about_us"
      >
        <View style={styles.logoContainer}>
          <Logo qaId="logo_about_us" />
        </View>

        <ContentWrapper
          style={{
            ...globalStyles.shadowElevationForLightTheme,
          }}
          qaId="about_us"
        >
          <InfoItem
            label={t("layout.shared.version")}
            value={appVersion}
            showSeparator={true}
            qaId="app_version_about_us"
          />

          <InfoItem
            label={t("layout.shared.region")}
            value={t(getActiveRegionLabelKey())}
            showSeparator={true}
            qaId="app_region_about_us"
          />

          <InfoItem
            label={t("user.aboutUs.website")}
            value="rainmaker.espressif.com"
            onPress={handleWebsiteClick}
            showSeparator={false}
            qaId="website"
          />
        </ContentWrapper>
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  logoContainer: {
    alignItems: "center",
    marginTop: tokens.spacing._40,
    marginBottom: tokens.spacing._30,
  },
});

export { AboutUs };
