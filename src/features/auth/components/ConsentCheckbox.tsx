/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, StyleSheet } from "react-native";
import { Checkbox } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { Typo } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import { getTermsOfUseLink, getPrivacyPolicyLink } from "@shared/utils/constants";
import * as WebBrowser from "expo-web-browser";

interface ConsentCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  consentText: string;
  termsLabel: string;
  andLabel: string;
  privacyLabel: string;
}

/**
 * Renders the consent checkbox UI section.
 */
export function ConsentCheckbox({
  checked,
  onToggle,
  consentText,
  termsLabel,
  andLabel,
  privacyLabel,
}: ConsentCheckboxProps) {
  const { i18n } = useTranslation();

  const showTerms = async () => {
    try {
      await WebBrowser.openBrowserAsync(getTermsOfUseLink(i18n.language));
    } catch (error) {
      console.error("Failed to open Terms of Use:", error);
    }
  };

  const showPrivacy = async () => {
    try {
      await WebBrowser.openBrowserAsync(getPrivacyPolicyLink(i18n.language));
    } catch (error) {
      console.error("Failed to open Privacy Policy:", error);
    }
  };

  return (
    <View {...testProps("view_consent")} style={styles.consentContainer}>
      <Checkbox.Android
        status={checked ? "checked" : "unchecked"}
        onPress={onToggle}
        color={tokens.colors.primary}
        uncheckedColor={tokens.colors.gray}
        {...testProps("checkbox_terms_consent")}
      />
      <View
        {...testProps("view_consent_text")}
        style={styles.consentTextContainer}
      >
        <Typo style={styles.consentText} qaId="typo_consent">
          {consentText}{" "}
          <Typo
            style={styles.linkText}
            onPress={showTerms}
            qaId="typo_terms_of_use"
          >
            {termsLabel}
          </Typo>{" "}
          {andLabel}{" "}
          <Typo
            style={styles.linkText}
            onPress={showPrivacy}
            qaId="typo_privacy_policy"
          >
            {privacyLabel}
          </Typo>
        </Typo>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  consentContainer: {
    width: "100%",
    marginVertical: tokens.spacing._15,
    flexDirection: "row",
    alignItems: "center",
  },
  consentTextContainer: {
    flex: 1,
  },
  consentText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.gray,
    lineHeight: 20,
  },
  linkText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.primary,
    textDecorationLine: "underline",
  },
});
