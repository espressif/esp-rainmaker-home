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
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";
// components
import { Input, Button, ScreenWrapper, Header, Logo } from "@/components";

// validations
import { validateEmail } from "@/utils/validations";

// constants
import { RESET_PASSWORD_CODE_TYPE } from "@/utils/constants";

/**
 * ForgotPasswordScreen component that displays the forgot password screen.
 *
 * This component displays the forgot password screen with a logo, input fields, and buttons.
 *
 */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { store } = useCDF();
  const router = useRouter();
  const toast = useToast();

  // Form state
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isConfirmPasswordValid, setIsConfirmPasswordValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Email validator for use with Input component
   * @param {string} email - The email to validate
   * @returns {{ isValid: boolean; error?: string }} - Validation result with error message
   */
  const emailValidator = (
    email: string
  ): { isValid: boolean; error?: string } => {
    if (!email.trim()) {
      return { isValid: false };
    }
    if (!validateEmail(email)) {
      return { isValid: false, error: t("auth.validation.invalidEmail") };
    }
    return { isValid: true };
  };

  /**
   * Validates password input
   * @param {string} password - The password to validate
   * @returns {{ isValid: boolean }} - Validation result
   */
  const passwordValidator = (
    password: string
  ): { isValid: boolean; error?: string } => {
    if (!password.trim()) {
      return { isValid: false };
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
   * Handles email change
   */
  const handleEmailChange = (value: string, isValid: boolean) => {
    setEmail(value.trim());
    setIsEmailValid(isValid);
  };

  /**
   * Handles password change
   */
  const handlePasswordChange = (value: string, isValid: boolean) => {
    const newPwd = value.trim();
    setNewPassword(newPwd);
    setIsPasswordValid(isValid);

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
   * Resets the password for the user.
   *
   * This function sends a verification code to the user's email address.
   *
   * SDK function used:
   * 1. forgotPassword
   */
  const resetPassword = () => {
    // Check if all fields are valid before submitting
    if (
      !isEmailValid ||
      !isPasswordValid ||
      !isConfirmPasswordValid ||
      !email ||
      !newPassword ||
      !confirmPassword
    ) {
      return;
    }

    setIsLoading(true);

    // send verification code to user's email address
    store.userStore.authInstance
      ?.forgotPassword(email)
      .then((res) => {
        // if success, redirect to code screen
        if (res.status === "success") {
          router.push({
            pathname: "/(auth)/ConfirmationCode",
            params: {
              email: email,
              password: newPassword,
              type: RESET_PASSWORD_CODE_TYPE,
            },
          });
        } else {
          toast.showError(
            t("auth.errors.verificationCodeSendFailed"),
            res.description || t("auth.errors.fallback")
          );
        }
      })
      .catch((error) => {
        toast.showError(
          t("auth.errors.verificationCodeSendFailed"),
          error.description || t("auth.errors.fallback")
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <>
      <Header showBack label={t("auth.forgotPassword.title")} />
      <ScreenWrapper style={globalStyles.screenWrapper}>
        <View style={[globalStyles.scrollViewContent, { paddingBottom: 100 }]}>
          <Logo />
          <View style={globalStyles.inputContainer}>
            {/* Email Input */}
            <Input
              icon="mail-open"
              placeholder={t("auth.shared.emailPlaceholder")}
              onFieldChange={handleEmailChange}
              validator={emailValidator}
              validateOnChange={true}
              debounceDelay={500}
              inputMode="email"
            />

            {/* New Password Input */}
            <Input
              isPassword
              icon="lock-closed"
              placeholder={t("auth.shared.newPasswordPlaceholder")}
              onFieldChange={handlePasswordChange}
              validator={passwordValidator}
              validateOnChange={true}
              debounceDelay={500}
            />

            {/* Confirm Password Input */}
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
            />

            {/* Reset Password Button */}
            <Button
              label={t("auth.forgotPassword.confirmButton")}
              disabled={
                !isEmailValid ||
                !isPasswordValid ||
                !isConfirmPasswordValid ||
                !email ||
                !newPassword ||
                !confirmPassword ||
                isLoading
              }
              onPress={resetPassword}
              style={globalStyles.signInButton}
              isLoading={isLoading}
            />
          </View>
        </View>
      </ScreenWrapper>
    </>
  );
}
