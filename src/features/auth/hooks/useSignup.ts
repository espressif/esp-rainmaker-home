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
import { getAuthAllowedUsernameTypes } from "@features/auth/utils/authHelper";
import {
  createAuthUsernameValidator,
  createPasswordValidator,
  createConfirmPasswordValidator,
  getAuthErrorDescription,
  isUsernameAllowedForAuth,
} from "@features/auth/utils/authHelper";

/**
 * Manages signup state and related actions.
 */
export function useSignup() {
  const { store } = useCDF();
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isConfirmPasswordValid, setIsConfirmPasswordValid] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const emailValidator = useMemo(
    () => createAuthUsernameValidator(getAuthAllowedUsernameTypes(), t),
    [t]
  );
  const passwordValidator = createPasswordValidator(t);
  const confirmPasswordValidator = createConfirmPasswordValidator(
    () => password,
    t
  );

  const handleEmailChange = (value: string, isValid: boolean) => {
    setEmail(value.trim());
    setIsEmailValid(isValid);
  };

  const handlePasswordChange = (value: string, isValid: boolean) => {
    setPassword(value);
    setIsPasswordValid(isValid);
  };

  const handleConfirmPasswordChange = (value: string, isValid: boolean) => {
    setConfirmPassword(value);
    setIsConfirmPasswordValid(isValid);
  };

  const signup = async () => {
    if (
      !isEmailValid ||
      !isPasswordValid ||
      !isConfirmPasswordValid ||
      !consentChecked
    ) {
      return;
    }

    const allowed = getAuthAllowedUsernameTypes();
    if (!isUsernameAllowedForAuth(email, allowed)) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await store?.userStore.auth?.getSignUpCode({
        username: email,
        password: password,
      });
      if (res) {
        toast.showSuccess(t("auth.verification.heading"), res.description || undefined, { duration: 4000 });
        router.push({
          pathname: "/(auth)/ConfirmationCode",
          params: { email, password },
        });
      }
    } catch (error: unknown) {
      console.error("Failed to send sign up code:", error);
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
    password,
    confirmPassword,
    isEmailValid,
    isPasswordValid,
    isConfirmPasswordValid,
    consentChecked,
    setConsentChecked,
    isLoading,
    emailValidator,
    passwordValidator,
    confirmPasswordValidator,
    handleEmailChange,
    handlePasswordChange,
    handleConfirmPasswordChange,
    signup,
  };
}
