/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { View } from "react-native";
// styles
import { globalStyles } from "@/theme/globalStyleSheet";
// hooks
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";
import { useRouter } from "expo-router";
// components
import { ScreenWrapper, Header, Input, Button, Logo } from "@/components";
import { ESPAPIError } from "@espressif/rainmaker-base-sdk";
import { testProps } from "@/utils/testProps";

const ChangePasswordScreen = () => {
  const { store } = useCDF();
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();

  // Form state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isOldPasswordValid, setIsOldPasswordValid] = useState(false);
  const [isNewPasswordValid, setIsNewPasswordValid] = useState(false);
  const [isConfirmPasswordValid, setIsConfirmPasswordValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Validates old password input
   * @param {string} password - The password to validate
   * @returns {{ isValid: boolean; error?: string }} - Validation result with error message
   */
  const oldPasswordValidator = (
    password: string
  ): { isValid: boolean; error?: string } => {
    if (!password.trim()) {
      return { isValid: false };
    }
    return { isValid: true };
  };

  /**
   * Validates new password input
   * @param {string} password - The password to validate
   * @returns {{ isValid: boolean; error?: string }} - Validation result with error message
   */
  const newPasswordValidator = (
    password: string
  ): { isValid: boolean; error?: string } => {
    if (!password.trim()) {
      return { isValid: false };
    }
    // Check if new password is same as old password
    if (password === oldPassword) {
      return {
        isValid: false,
        error: t("auth.validation.newPasswordSameAsCurrent"),
      };
    }
    return { isValid: true };
  };

  /**
   * Validates confirm password input
   * @param {string} confirmPwd - The confirm password to validate
   * @returns {{ isValid: boolean, error?: string }} - Validation result with error message
   */
  const confirmPasswordValidator = useCallback(
    (confirmPwd: string): { isValid: boolean; error?: string } => {
      if (!confirmPwd.trim()) {
        return { isValid: false };
      }
      if (confirmPwd !== newPassword) {
        return {
          isValid: false,
          error: t("auth.validation.passwordsDoNotMatch"),
        };
      }
      return { isValid: true };
    },
    [newPassword, t]
  );

  /**
   * Handles old password change
   */
  const handleOldPasswordChange = (value: string, isValid: boolean) => {
    setOldPassword(value.trim());
    setIsOldPasswordValid(isValid);
  };

  /**
   * Handles new password change
   */
  const handleNewPasswordChange = (value: string, isValid: boolean) => {
    const newPwd = value.trim();
    setNewPassword(newPwd);
    setIsNewPasswordValid(isValid);

    // Re-validate confirm password when new password changes
    if (confirmPassword.trim()) {
      const isConfirmValid = confirmPassword.trim() === newPwd;
      setIsConfirmPasswordValid(isConfirmValid);
    }
  };

  /**
   * Handles confirm password change
   */
  const handleConfirmPasswordChange = (value: string) => {
    const confirmPwd = value.trim();
    setConfirmPassword(confirmPwd);

    // Validate if passwords match
    const isConfirmValid = confirmPwd === newPassword;
    setIsConfirmPasswordValid(isConfirmValid);
  };

  /**
   * Handles the password change submission process.
   *
   * This function performs the following operations:
   * 1. Validates that all password fields are valid
   * 2. Attempts to change the password using the user store
   * 3. Logs out the user upon successful password change
   * 4. Handles various error cases including invalid tokens
   *
   * SDK function used:
   * 1. changePassword
   * 2. logout
   */
  const handleSubmit = async () => {
    // Check if all fields are valid before submitting
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
      await store.userStore.user?.changePassword(oldPassword, newPassword);
      toast.showSuccess(t("auth.changePassword.passwordChangedSuccessfully"));
      // Logout user
      await store.userStore.user?.logout();
      router.replace("/(auth)/Login");
    } catch (error) {
      toast.showError(
        t("auth.errors.changePasswordFailed"),
        (error as ESPAPIError).description || t("auth.errors.fallback")
      );
    } finally {
      // Reset loading state
      setIsLoading(false);
    }
  };

  return (
    <>
      <Header label={t("auth.changePassword.title")} showBack qaId="header_change_password" />
      <ScreenWrapper style={globalStyles.screenWrapper} qaId="screen_wrapper_change_password">
        <View {...testProps("view_change_password")} style={[globalStyles.scrollViewContent, { paddingBottom: 100 }]}>
          <Logo qaId="logo_change_password" />
          <View {...testProps("view_input_change_password")} style={globalStyles.inputContainer}>
            {/* Old Password */}
            <Input
              isPassword
              icon="lock-closed"
              placeholder={t("auth.changePassword.currentPasswordPlaceholder")}
              onFieldChange={handleOldPasswordChange}
              validator={oldPasswordValidator}
              validateOnChange={true}
              debounceDelay={500}
              qaId="current_password"
            />
            {/* New Password */}
            <Input
              isPassword
              icon="lock-closed"
              placeholder={t("auth.shared.newPasswordPlaceholder")}
              onFieldChange={handleNewPasswordChange}
              validator={newPasswordValidator}
              validateOnChange={true}
              debounceDelay={500}
              qaId="new_password"
            />
            {/* Confirm Password */}
            <Input
              key={newPassword}
              isPassword
              icon="lock-closed"
              placeholder={t("auth.shared.confirmPasswordPlaceholder")}
              initialValue={confirmPassword}
              onFieldChange={handleConfirmPasswordChange}
              validator={confirmPasswordValidator}
              validateOnChange={true}
              debounceDelay={50}
              qaId="confirm_password"
            />
            {/* Submit Button */}
            <Button
              label={t("auth.changePassword.updateButton")}
              onPress={handleSubmit}
              disabled={
                !isOldPasswordValid ||
                !isNewPasswordValid ||
                !isConfirmPasswordValid ||
                !oldPassword ||
                !newPassword ||
                !confirmPassword ||
                isLoading
              }
              style={globalStyles.signInButton}
              isLoading={isLoading}
              qaId="button_update_change_password"
            />
          </View>
        </View>
      </ScreenWrapper>
    </>
  );
};

export default ChangePasswordScreen;
