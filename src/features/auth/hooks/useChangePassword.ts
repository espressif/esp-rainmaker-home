/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { useCDF } from "@shared/hooks/useCDF";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import { resetStackTo } from "@shared/utils/navigation";
import {
  createPasswordValidator,
  createNewPasswordValidator,
  createConfirmPasswordValidator,
  getAuthErrorDescription,
} from "@features/auth/utils/authHelper";

/**
 * Manages change password state and related actions.
 */
export function useChangePassword() {
  const { store } = useCDF();
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isOldPasswordValid, setIsOldPasswordValid] = useState(false);
  const [isNewPasswordValid, setIsNewPasswordValid] = useState(false);
  const [isConfirmPasswordValid, setIsConfirmPasswordValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const oldPasswordValidator = createPasswordValidator(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  const newPasswordValidator = useCallback(
    createNewPasswordValidator(() => oldPassword, t),
    [oldPassword, t]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  const confirmPasswordValidator = useCallback(
    createConfirmPasswordValidator(() => newPassword, t),
    [newPassword, t]
  );

  const handleOldPasswordChange = (value: string, isValid: boolean) => {
    setOldPassword(value.trim());
    setIsOldPasswordValid(isValid);
  };

  const handleNewPasswordChange = (value: string, isValid: boolean) => {
    setNewPassword(value);
    setIsNewPasswordValid(isValid);
    if (confirmPassword.trim()) {
      setIsConfirmPasswordValid(confirmPassword === value);
    }
  };

  const handleConfirmPasswordChange = (value: string, isValid: boolean) => {
    setConfirmPassword(value);
    setIsConfirmPasswordValid(isValid);
  };

  const handleSubmit = async () => {
    if (
      !isOldPasswordValid ||
      !isNewPasswordValid ||
      !isConfirmPasswordValid ||
      !oldPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const user = store?.userStore.user;
      const res = await user?.changePassword(oldPassword, newPassword);
      await user?.logout();
      toast.showSuccess(t("auth.changePassword.passwordChangedSuccessfully"), res?.description || undefined);
      // Changing the password signs the user out, so reset the stack — a plain
      // `replace` would leave the signed-in screens this was opened from
      // (User → Change Password) reachable with back.
      resetStackTo(router, "/(auth)/Login");
    } catch (error: unknown) {
      toast.showError(
        t("auth.errors.changePasswordFailed"),
        getAuthErrorDescription(error) || t("auth.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  };

  return {
    oldPassword,
    newPassword,
    confirmPassword,
    isOldPasswordValid,
    isNewPasswordValid,
    isConfirmPasswordValid,
    isLoading,
    oldPasswordValidator,
    newPasswordValidator,
    confirmPasswordValidator,
    handleOldPasswordChange,
    handleNewPasswordChange,
    handleConfirmPasswordChange,
    handleSubmit,
  };
}
