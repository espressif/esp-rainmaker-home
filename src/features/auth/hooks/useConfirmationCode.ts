/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { useTranslation } from "react-i18next";
import { createCodeValidator, getAuthErrorDescription } from "@features/auth/utils/authHelper";
import { setPendingPostSignupLogin } from "@features/auth/hooks/useLogin";
import { router } from "expo-router";

/**
 * Manages confirmation code state and related actions.
 */
export function useConfirmationCode() {
  const { t } = useTranslation();
  const { store } = useCDF();
  const { email, password = "" } = useLocalSearchParams();
  const toast = useToast();

  const [code, setCode] = useState("");
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const codeValidator = createCodeValidator(t("auth.validation.invalidCode"));

  const handleCodeChange = (value: string, isValid: boolean) => {
    setCode(value);
    setIsCodeValid(isValid);
  };

  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [countdown]);

  const handleResendCode = async () => {
    if (countdown > 0) return;

    setIsLoading(true);
    try {
      const res = await store?.userStore.auth?.getSignUpCode({
        username: email as string,
        password: password as string,
      });
      if (res) {
        toast.showSuccess(t("auth.verification.heading"));
        setCountdown(60);
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

  const handleVerify = async () => {
    if (!isCodeValid || !code.trim()) return;

    setIsLoading(true);
    try {
      const res = await store?.userStore.auth?.confirmSignUp({
        username: email as string,
        verificationCode: code,
      });
      if (res) {
        toast.showSuccess(t("auth.signup.registrationSuccess"), undefined, { duration: 4000 });
        setPendingPostSignupLogin({
          username: email as string,
          password: password as string,
        });
        router.dismissTo("/(auth)/Login");
      }
    } catch (error: unknown) {
      toast.showError(
        t("auth.errors.signupConfirmationFailed"),
        getAuthErrorDescription(error) || t("auth.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  };

  return {
    code,
    isCodeValid,
    isLoading,
    countdown,
    codeValidator,
    handleCodeChange,
    handleResendCode,
    handleVerify,
  };
}
