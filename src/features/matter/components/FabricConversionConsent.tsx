/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Home } from "lucide-react-native";

import { ActionButton } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

/** Props for {@link FabricConversionConsent}. */
export interface FabricConversionConsentProps {
  /** Display name of the active home */
  homeName: string;
  /** User tapped Continue to convert the home to a Matter fabric */
  onConfirm: () => void;
  /** User tapped Go back */
  onDecline: () => void;
  /** When true, primary action shows a loading state */
  isConverting?: boolean;
}

/**
 * Reusable consent step: centered icon and copy, primary/secondary actions at the bottom
 * (same layout pattern as {@link SceneActionButtons} on Create Scene).
 * @param props - Home label, handlers, and optional loading state
 * @returns Fabric conversion consent UI
 */
export function FabricConversionConsent({
  homeName,
  onConfirm,
  onDecline,
  isConverting = false,
}: FabricConversionConsentProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View
      {...testProps("view_fabric_conversion_consent")}
      style={styles.root}
    >
      <View
        {...testProps("view_fabric_conversion_consent_body")}
        style={styles.body}
      >
        <View
          {...testProps("view_fabric_conversion_consent_icon")}
          style={globalStyles.permissionIconContainer}
        >
          <Home size={40} color={tokens.colors.gray} />
        </View>
        <Text
          {...testProps("text_fabric_conversion_consent_title")}
          style={[globalStyles.heading, globalStyles.permissionTitle]}
        >
          {t("device.matter.commissioning.convertTitle")}
        </Text>
        <Text
          {...testProps("text_fabric_conversion_consent_message")}
          style={[globalStyles.textGray, globalStyles.permissionDescription]}
        >
          {t("device.matter.commissioning.convertMessage", { homeName })}
        </Text>
      </View>

      <View
        {...testProps("view_fabric_conversion_consent_footer")}
        style={[globalStyles.actionButtonContainer, styles.footer]}
      >
        <ActionButton
          qaId="button_fabric_conversion_consent_confirm"
          onPress={onConfirm}
          disabled={isConverting}
          variant="primary"
        >
          {isConverting ? (
            <ActivityIndicator size="small" color={tokens.colors.white} />
          ) : (
            <Text
              {...testProps("text_fabric_conversion_consent_confirm")}
              style={[globalStyles.buttonText, globalStyles.buttonTextPrimary]}
            >
              {t("device.matter.commissioning.convertConfirm")}
            </Text>
          )}
        </ActionButton>
        <ActionButton
          qaId="button_fabric_conversion_consent_back"
          onPress={onDecline}
          disabled={isConverting}
          variant="secondary"
        >
          <Text
            {...testProps("text_fabric_conversion_consent_back")}
            style={[globalStyles.buttonText, globalStyles.buttonTextSecondary]}
          >
            {t("device.matter.commissioning.convertBack")}
          </Text>
        </ActionButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: tokens.spacing._20,
  },
  footer: {
    marginTop: "auto",
    flexDirection: "column",
    alignItems: "stretch",
    width: "100%",
    paddingHorizontal: tokens.spacing._15,
  },
});
