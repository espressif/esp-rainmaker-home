/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useTranslation } from "react-i18next";

import { ScreenWrapper, Button } from "@shared/components";
import { getPrivacyPolicyLink } from "@shared/utils/legalLinks";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

import { useConsent } from "@features/consent/hooks/useConsent";

/**
 * CN-region first-launch consent screen.
 *
 * Presents the privacy policy full-screen in an in-app WebView with a primary
 * "Accept & Continue" action and a de-emphasized decline action floating over
 * the bottom of the policy. Shown (before login / permission prompts) only when
 * the active region is CN and consent has not yet been accepted. Accepting
 * continues the normal startup flow; declining exits the app.
 */
export function ConsentScreen() {
  const { t, i18n } = useTranslation();
  const { isSubmitting, agree, disagree } = useConsent();

  return (
    <ScreenWrapper style={styles.container} dismissKeyboard={false} qaId="view_consent_screen">
      <WebView
        source={{ uri: getPrivacyPolicyLink(i18n.language) }}
        style={styles.webView}
        startInLoadingState
        {...testProps("view_consent_webview")}
      />

      <View style={styles.actions} {...testProps("view_consent_actions")}>
        <Button
          label={t("consent.acceptAndContinue")}
          onPress={agree}
          isLoading={isSubmitting}
          qaId="button_consent_accept"
        />
        <Button
          label={t("consent.disagree")}
          onPress={disagree}
          disabled={isSubmitting}
          style={styles.declineButton}
          textStyle={styles.declineText}
          qaId="button_consent_disagree"
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 0,
  },
  webView: {
    flex: 1,
  },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.gray,
  },
  declineButton: {
    backgroundColor: "transparent",
    paddingVertical: tokens.spacing._5,
    marginBottom: 0,
  },
  declineText: {
    color: tokens.colors.text_secondary,
    fontFamily: tokens.fonts.regular,
    fontSize: tokens.fontSize.sm,
  },
});
