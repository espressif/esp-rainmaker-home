/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet } from "react-native";
// expo
import * as WebBrowser from "expo-web-browser";

// constants
import { WEBSITE_LINK } from "@/utils/constants";
// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Hooks
import { useTranslation } from "react-i18next";

// Components
import {
  Header,
  ContentWrapper,
  ScreenWrapper,
  InfoItem,
  Logo,
} from "@/components";

// config
import APP_CONFIG from "@/app.json";

/**
 * AboutUs
 *
 * Displays the About Us screen with app version, logo, and website information
 */
const AboutUs: React.FC = () => {
  // Hooks
  const { t } = useTranslation();
  const appVersion = APP_CONFIG.expo.version;

  /**
   * Website click handler
   */
  const handleWebsiteClick = async () => {
    const url = WEBSITE_LINK;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error("Failed to open URL:", error);
    }
  };

  // Render
  return (
    <>
      <Header label={t("user.aboutUs.title")} showBack={true} />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
      >
        <View style={styles.logoContainer}>
          <Logo />
        </View>

        <ContentWrapper
          style={{
            ...globalStyles.shadowElevationForLightTheme,
          }}
        >
          {/* version */}
          <InfoItem
            label={t("layout.shared.version")}
            value={appVersion}
            showSeparator={true}
          />

          {/* website */}
          <InfoItem
            label={t("user.aboutUs.website")}
            value="rainmaker.espressif.com"
            onPress={handleWebsiteClick}
            showSeparator={false}
          />
        </ContentWrapper>
      </ScreenWrapper>
    </>
  );
};

// Styles
const styles = StyleSheet.create({
  logoContainer: {
    alignItems: "center",
    marginTop: tokens.spacing._40,
    marginBottom: tokens.spacing._30,
  },
});

export default AboutUs;
