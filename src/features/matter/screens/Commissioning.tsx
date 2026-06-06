/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { Header, ScreenWrapper } from "@shared/components";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import { FabricConversionConsent } from "@features/matter/components";
import { useCommissioning } from "@features/matter/hooks/useCommissioning";
import {
  MATTER_COMMISSIONING_PHASE_COMMISSIONING,
  MATTER_COMMISSIONING_PHASE_CONVERTING,
  MATTER_COMMISSIONING_PHASE_ERROR,
  MATTER_COMMISSIONING_PHASE_LOADING,
  MATTER_COMMISSIONING_PHASE_NEEDS_CONVERSION,
  MATTER_COMMISSIONING_PHASE_PREPARING,
  MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED,
  MATTER_ROUTE_PARAM_VALUE_FALSE,
} from "@features/matter/constants";

/** Optional props for {@link CommissioningScreen} (route may pass via search params). */
export interface CommissioningScreenProps {
  /**
   * When true, show fabric conversion consent before converting.
   * Defaults from route param {@link MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED}.
   */
  fabricConversionConsentRequired?: boolean;
}

/**
 * Matter commissioning for the **current home** (no fabric picker).
 * Shows conversion consent, progress, or error inline.
 * @param props - Optional overrides; route search params used when omitted
 * @returns Commissioning screen UI
 */
export function CommissioningScreen({
  fabricConversionConsentRequired: fabricConversionConsentRequiredProp,
}: CommissioningScreenProps = {}): React.ReactElement {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    qrData?: string;
    [MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED]?: string;
  }>();
  const qrPayload = typeof params.qrData === "string" ? params.qrData : "";

  const fabricConversionConsentRequired = useMemo(() => {
    if (fabricConversionConsentRequiredProp !== undefined) {
      return fabricConversionConsentRequiredProp;
    }
    const raw = params[MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED];
    return raw !== MATTER_ROUTE_PARAM_VALUE_FALSE;
  }, [fabricConversionConsentRequiredProp, params]);

  const {
    phase,
    statusMessage,
    errorMessage,
    activeHomeName,
    onConfirmConvert,
    onDeclineConvert,
  } = useCommissioning({
    qrData: qrPayload,
    fabricConversionConsentRequired,
  });

  const showProgress =
    phase === MATTER_COMMISSIONING_PHASE_LOADING ||
    phase === MATTER_COMMISSIONING_PHASE_PREPARING ||
    phase === MATTER_COMMISSIONING_PHASE_CONVERTING ||
    phase === MATTER_COMMISSIONING_PHASE_COMMISSIONING;

  const showConsent =
    fabricConversionConsentRequired &&
    phase === MATTER_COMMISSIONING_PHASE_NEEDS_CONVERSION;

  return (
    <>
      <Header label={t("device.matter.commissioning.title")} />
      <ScreenWrapper style={globalStyles.container}>
        {showConsent && (
          <FabricConversionConsent
            homeName={activeHomeName}
            onConfirm={onConfirmConvert}
            onDecline={onDeclineConvert}
          />
        )}

        {showProgress && (
          <View
            {...testProps("view_matter_commissioning_progress")}
            style={styles.centerContainer}
          >
            <ActivityIndicator size="large" color={tokens.colors.primary} />
            <Text
              {...testProps("text_matter_commissioning_status")}
              style={styles.statusText}
            >
              {statusMessage || t("device.matter.commissioning.preparing")}
            </Text>
          </View>
        )}

        {phase === MATTER_COMMISSIONING_PHASE_ERROR && (
          <View
            {...testProps("view_matter_commissioning_error")}
            style={styles.centerContainer}
          >
            <Text
              {...testProps("text_matter_commissioning_error")}
              style={styles.errorText}
            >
              {errorMessage ?? t("device.matter.commissioning.failed")}
            </Text>
            <Text
              {...testProps("text_matter_commissioning_scan_again")}
              style={styles.scanAgainHint}
            >
              {t("device.matter.commissioning.scanAgainHint")}
            </Text>
          </View>
        )}
      </ScreenWrapper>
    </>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing._20,
  },
  statusText: {
    marginTop: tokens.spacing._15,
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    fontFamily: tokens.fonts.regular,
  },
  errorText: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.error,
    textAlign: "center",
    marginBottom: tokens.spacing._10,
    fontFamily: tokens.fonts.regular,
  },
  scanAgainHint: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    fontFamily: tokens.fonts.regular,
  },
});
