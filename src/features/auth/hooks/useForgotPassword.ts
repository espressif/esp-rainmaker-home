/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from "react";
import { useCDF } from "@shared/hooks/useCDF";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import {
  createAuthUsernameValidator,
  getAuthErrorDescription,
  isUsernameAllowedForAuth,
} from "@features/auth/utils/authHelper";
import { getAuthAllowedUsernameTypes } from "@features/auth/utils/authHelper";

/**
 * Manages forgot password state and related actions.
 */
export function useForgotPassword() {
  const { t } = useTranslation();
  const { store } = useCDF();
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const emailValidator = useMemo(
    () => createAuthUsernameValidator(getAuthAllowedUsernameTypes(), t),
    [t]
  );

  const handleEmailChange = (value: string, isValid: boolean) => {
    setEmail(value.trim());
    setIsEmailValid(isValid);
  };

  const sendVerificationCode = async () => {
    if (!isEmailValid || !email) return;

    const allowed = getAuthAllowedUsernameTypes();
    if (!isUsernameAllowedForAuth(email, allowed)) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await store?.userStore.auth?.forgotPassword({
        username: email,
      });
      if (res) {
        toast.showSuccess(t("auth.verification.heading"), undefined, { duration: 4000 });
        router.push({
          pathname: "/(auth)/ResetPassword",
          params: { username: email },
        });
      }
    } catch (error: unknown) {
      toast.showError(
        t("auth.errors.verificationCodeSendFailed"),
        getAuthErrorDescription(error) || t("auth.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  };

  return {
    email,
    isEmailValid,
    isLoading,
    emailValidator,
    handleEmailChange,
    sendVerificationCode,
  };
}
