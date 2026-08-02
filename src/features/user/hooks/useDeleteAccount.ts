/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import StorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";

// Hooks
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";

// Utils
import { createCodeValidator } from "@features/auth/utils/authHelper";
import { getPreAuthRoute } from "@features/landing";

/**
 * Manages delete account state and related actions.
 */
export const useDeleteAccount = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { store } = useCDF();
  const toast = useToast();

  const [showVerification, setShowVerification] = useState(false);
  const [code, setCode] = useState("");
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const user = store?.userStore.user;
  const codeValidator = createCodeValidator(t("user.validation.invalidCode"));

  useEffect(() => {
    if (countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [countdown]);

  const handleCodeChange = (value: string, isValid: boolean) => {
    setCode(value);
    setIsCodeValid(isValid);
  };

  const handleProceed = async () => {
    if (countdown > 0) return;
    setIsLoading(true);
    try {
      await user?.requestAccountDeletion();
      setShowVerification(true);
      setCountdown(60);
      toast.showSuccess(t("user.deleteAccount.verificationCodeSent"));
    } catch (error: unknown) {
      const err = error as { description?: string };
      toast.showError(
        t("user.errors.verificationCodeSendFailed"),
        err.description || t("user.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isCodeValid || !code.trim()) return;

    setIsLoading(true);
    try {
      await user?.confirmAccountDeletion(code.trim());
      await StorageAdapter.clear();
      toast.showSuccess(t("user.deleteAccount.deleteConfirmed"));
      // Account is gone: same helper the logout flow uses — Landing only if
      // the user hasn't picked a backend yet, Login otherwise.
      router.replace(getPreAuthRoute() as never);
    } catch (error: unknown) {
      const err = error as { description?: string };
      toast.showError(
        t("user.errors.accountDeletionFailed"),
        err.description || t("user.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  };

  return {
    showVerification,
    code,
    isCodeValid,
    isLoading,
    countdown,
    userEmail: user?.userInfo?.email || "",
    codeValidator,
    handleCodeChange,
    handleProceed,
    handleVerify,
  };
};
