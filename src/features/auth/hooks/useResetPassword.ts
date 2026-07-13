/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { useTranslation } from "react-i18next";
import {
  createCodeValidator,
  createPasswordValidator,
  createConfirmPasswordValidator,
  isUsernameAllowedForAuth,
} from "@features/auth/utils/authHelper";
import { getAuthAllowedUsernameTypes } from "@features/auth/utils/authHelper";

/**
 * Manages reset password state and related actions.
 */
export function useResetPassword() {
  const { t } = useTranslation();
  const { store } = useCDF();
  const { username } = useLocalSearchParams();
  const toast = useToast();
  const usernameFromRoute = typeof username === "string" ? username : "";

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isConfirmPasswordValid, setIsConfirmPasswordValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const codeValidator = createCodeValidator(t("auth.validation.invalidCode"));
  const passwordValidator = createPasswordValidator(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  const confirmPasswordValidator = useCallback(
    createConfirmPasswordValidator(() => newPassword, t),
    [newPassword, t]
  );

  const handleCodeChange = (value: string, isValid: boolean) => {
    setCode(value);
    setIsCodeValid(isValid);
  };

  const handlePasswordChange = (value: string, isValid: boolean) => {
    const newPwd = value.trim();
    setNewPassword(newPwd);
    setIsPasswordValid(isValid);
    if (confirmPassword.trim()) {
      setIsConfirmPasswordValid(confirmPassword.trim() === newPwd);
    }
  };

  const handleConfirmPasswordChange = (value: string, isValid: boolean) => {
    setConfirmPassword(value.trim());
    setIsConfirmPasswordValid(isValid);
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

    if (
      !isUsernameAllowedForAuth(
        usernameFromRoute,
        getAuthAllowedUsernameTypes()
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await store?.userStore.auth?.forgotPassword({
        username: usernameFromRoute,
      });
      if (res) {
        toast.showSuccess(t("auth.verification.heading"));
        setCountdown(60);
      }
    } catch (error: unknown) {
      const err = error as { description?: string };
      toast.showError(
        t("auth.errors.verificationCodeSendFailed"),
        err.description || t("auth.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (
      !isCodeValid ||
      !code.trim() ||
      !isPasswordValid ||
      !newPassword.trim() ||
      !isConfirmPasswordValid ||
      !confirmPassword.trim()
    ) {
      return;
    }

    if (
      !isUsernameAllowedForAuth(
        usernameFromRoute,
        getAuthAllowedUsernameTypes()
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await store?.userStore.auth?.setNewPassword({
        username: usernameFromRoute,
        newPassword: newPassword,
        verificationCode: code,
      });
      if (res) {
        toast.showSuccess(t("auth.forgotPassword.resetSuccess"), undefined, { duration: 4000 });
        const { router } = await import("expo-router");
        router.dismissTo({
          pathname: "/(auth)/Login",
          params: { username: usernameFromRoute },
        });
      }
    } catch (error: unknown) {
      const err = error as { description?: string };
      toast.showError(
        t("auth.errors.passwordResetFailed"),
        err.description || t("auth.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  };

  return {
    code,
    newPassword,
    confirmPassword,
    isCodeValid,
    isPasswordValid,
    isConfirmPasswordValid,
    isLoading,
    countdown,
    codeValidator,
    passwordValidator,
    confirmPasswordValidator,
    handleCodeChange,
    handlePasswordChange,
    handleConfirmPasswordChange,
    handleResendCode,
    handleResetPassword,
  };
}
