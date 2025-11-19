/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

// styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";
// hooks
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";
// components
import { ScreenWrapper, Header, Input, Button } from "@/components";

import APP_CONFIG from "@/app.json";

/**
 * ResetPasswordScreen component that handles password reset with OTP verification.
 *
 * This component displays a screen where users enter:
 * - 6-digit OTP code sent to their email
 * - New password
 * - Confirm password
 *
 * It combines OTP verification and password reset into a single step.
 */
const ResetPasswordScreen = () => {
  const appVersion = APP_CONFIG.expo.version;

  const { t } = useTranslation();
  const { store } = useCDF();
  const { email } = useLocalSearchParams();
  const toast = useToast();

  // Form state
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isConfirmPasswordValid, setIsConfirmPasswordValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // ref
  const timerRef = useRef<NodeJS.Timeout>();

  /**
   * Verification code validator - checks if the code meets requirements
   * @param inputCode - The code to validate
   * @returns {isValid: boolean, error?: string} - The validation result with error message
   */
  const codeValidator = (
    inputCode: string
  ): { isValid: boolean; error?: string } => {
    if (!inputCode.trim()) {
      return { isValid: false };
    }
    if (inputCode.trim().length !== 6) {
      return {
        isValid: false,
        error: t("auth.validation.invalidCode"),
      };
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
   * Handles code change
   */
  const handleCodeChange = (value: string, isValid: boolean) => {
    setCode(value);
    setIsCodeValid(isValid);
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
  const handleConfirmPasswordChange = (value: string, isValid: boolean) => {
    const confirmPwd = value.trim();
    setConfirmPassword(confirmPwd);
    setIsConfirmPasswordValid(isValid);
  };

  /**
   * Handles the countdown timer for the code resend functionality.
   *
   * This effect starts a countdown timer when countdown is greater than 0.
   * It decrements the countdown every second until it reaches 0.
   * When countdown reaches 0, it clears the interval.
   */
  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [countdown]);

  /**
   * Handles the resend code functionality.
   *
   * This function sends a new verification code to the user's email address.
   * It checks if a countdown is active and prevents resending if it is.
   *
   * SDK function used:
   * 1. forgotPassword
   */
  const handleResendCode = () => {
    if (countdown > 0) return;

    setIsLoading(true);

    // Send verification code for password reset
    store.userStore.authInstance
      ?.forgotPassword(email as string)
      .then((res) => {
        if (res.status === "success") {
          toast.showSuccess(t("auth.verification.heading"));
          // reset countdown to 60 seconds
          setCountdown(60);
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
        // reset loading state
        setIsLoading(false);
      });
  };

  /**
   * Handles the password reset with OTP verification.
   *
   * This function verifies the OTP code and sets the new password.
   * On success, redirects to the login page.
   *
   * SDK function used:
   * 1. setNewPassword
   */
  const handleResetPassword = () => {
    // Check if all fields are valid before submitting
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

    setIsLoading(true);

    store.userStore.authInstance
      ?.setNewPassword(email as string, newPassword, code)
      .then((res) => {
        if (res.status === "success") {
          toast.showSuccess(t("auth.forgotPassword.resetSuccess"));
          // redirect to login page
          router.dismissTo({
            pathname: "/(auth)/Login",
            params: { email: email },
          });
        } else {
          toast.showError(
            t("auth.errors.passwordResetFailed"),
            res.description || t("auth.errors.fallback")
          );
        }
      })
      .catch((error) => {
        toast.showError(
          t("auth.errors.passwordResetFailed"),
          error.description || t("auth.errors.fallback")
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <>
      <Header showBack label={t("auth.forgotPassword.resetTitle")} />
      <ScreenWrapper style={globalStyles.screenWrapper}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ScrollView 
            contentContainerStyle={globalStyles.scrollViewContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[globalStyles.heading, globalStyles.verificationTitle]}>
              {t("auth.forgotPassword.resetHeading")}
            </Text>
            <Text
              style={[globalStyles.subHeading, globalStyles.verificationSubtitle]}
            >
              {t("auth.verification.subtitle", { email: email as string })}
            </Text>

            <View style={globalStyles.verificationContainer}>
              {/* Code Input */}
              <Input
                initialValue={code}
                onFieldChange={handleCodeChange}
                validator={codeValidator}
                validateOnChange={true}
                debounceDelay={500}
                style={[globalStyles.verificationInput, { letterSpacing: 8 }]}
                keyboardType="numeric"
                maxLength={6}
                autoFocus
              />
            </View>

            <View style={[globalStyles.inputContainer]}>
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
                debounceDelay={500}
              />

              {/* Reset Password Button */}
              <Button
                label={t("auth.forgotPassword.confirmButton")}
                onPress={handleResetPassword}
                style={{
                  ...globalStyles.verificationButton,
                  marginTop: tokens.spacing._20,
                }}
                disabled={
                  !isCodeValid ||
                  !isPasswordValid ||
                  !isConfirmPasswordValid ||
                  isLoading
                }
                isLoading={isLoading}
              />

              {/* Resend Code Button with countdown */}
              <TouchableOpacity
                onPress={handleResendCode}
                disabled={countdown > 0 || isLoading}
              >
                <Text
                  style={[
                    globalStyles.linkText,
                    countdown > 0 && { opacity: 0.5 },
                  ]}
                >
                  {countdown > 0
                    ? `${t("auth.verification.resendCode")} (${countdown}s)`
                    : t("auth.verification.resendCode")}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        {/* App Version Text */}
        <Text style={globalStyles.versionText}>
          {t("layout.shared.version")} {appVersion}
        </Text>
      </ScreenWrapper>
    </>
  );
};

export default ResetPasswordScreen;
