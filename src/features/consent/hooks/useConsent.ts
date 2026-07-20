/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Alert, BackHandler, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import ESPAppUtilityAdapter from "@native-adaptors/implementations/ESPAppUtilityAdapter";
import { setConsentAccepted } from "@features/consent/utils/consentStorage";

interface UseConsentResult {
  /** True while the agree action is being persisted. */
  isSubmitting: boolean;
  /** Accept consent, unlock native startup permissions, and continue the flow. */
  agree: () => Promise<void>;
  /** Decline consent and exit the app. */
  disagree: () => void;
}

/**
 * Stateful logic for the CN-region consent screen.
 *
 * On accept it persists the consent flag (JS), tells the native layer to record
 * consent and run the startup permission prompts that were deferred until now,
 * then re-enters the root gate (`/`) so the normal login flow proceeds.
 * On decline: Android exits the app; iOS (where apps must not terminate
 * themselves) explains that consent is required to continue.
 * @returns Submitting state plus `agree` / `disagree` handlers.
 */
export function useConsent(): UseConsentResult {
  const router = useRouter();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const agree = async (): Promise<void> => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await setConsentAccepted();
      // Native: persist consent + trigger the startup permission prompts that
      // MainActivity deferred until consent was given.
      await ESPAppUtilityAdapter.acceptCnConsent();
      router.replace("/");
    } finally {
      setIsSubmitting(false);
    }
  };

  const disagree = (): void => {
    if (Platform.OS === "android") {
      BackHandler.exitApp();
      return;
    }
    // iOS: App Store guidelines forbid programmatic exit; keep the user on the
    // consent screen and explain why they cannot proceed.
    Alert.alert(t("consent.declinedTitle"), t("consent.declinedMessage"));
  };

  return { isSubmitting, agree, disagree };
}
