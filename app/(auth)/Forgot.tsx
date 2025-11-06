/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";

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
import APP_CONFIG from "@/app.json";
import { testProps } from "@/utils/testProps";

/**
 * ForgotPasswordScreen component that displays the forgot password screen.
 *
 * This component displays the forgot password screen where user enters their email
 * to receive a password reset verification code.
 *
 */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { store } = useCDF();
  const router = useRouter();
  const toast = useToast();

  const appVersion = APP_CONFIG.expo.version;

  // Form state
  const [email, setEmail] = useState("");
  const [isEmailValid, setIsEmailValid] = useState(false);
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
   * Handles email change
   */
  const handleEmailChange = (value: string, isValid: boolean) => {
    setEmail(value.trim());
    setIsEmailValid(isValid);
  };

  /**
   * Sends verification code to user's email for password reset.
   *
   * This function sends a verification code to the user's email address
   * and navigates to the reset password screen where user can enter OTP and new password.
   *
   * SDK function used:
   * 1. forgotPassword
   */
  const sendVerificationCode = () => {
    // Check if email is valid before submitting
    if (!isEmailValid || !email) {
      return;
    }

    setIsLoading(true);

    // send verification code to user's email address
    store.userStore.authInstance
      ?.forgotPassword(email)
      .then((res) => {
        // if success, redirect to reset password screen
        if (res.status === "success") {
          toast.showSuccess(t("auth.verification.heading"));
          router.push({
            pathname: "/(auth)/ResetPassword",
            params: {
              email: email,
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
      <Header showBack label={t("auth.forgotPassword.title")} qaId="header_forgot_password" />
      <ScreenWrapper style={globalStyles.screenWrapper} qaId="screen_wrapper_forgot">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <View {...testProps("view_forgot")} style={[globalStyles.scrollViewContent, { paddingBottom: 100 }]}>
            <Logo qaId="logo_forgot_password" />
            
            <Text {...testProps("text_forgot_heading")} style={[globalStyles.heading, globalStyles.verificationTitle]}>
              {t("auth.forgotPassword.heading")}
            </Text>
            <Text
              {...testProps("text_forgot_subtitle")}
              style={[globalStyles.subHeading, globalStyles.verificationSubtitle]}
            >
              {t("auth.forgotPassword.subtitle")}
            </Text>
            <View {...testProps("view_input_forgot")} style={globalStyles.inputContainer}>
              {/* Email Input */}
              <Input
                icon="mail-open"
                placeholder={t("auth.shared.emailPlaceholder")}
                onFieldChange={handleEmailChange}
                validator={emailValidator}
                validateOnChange={true}
                debounceDelay={500}
                inputMode="email"
                autoFocus
                qaId="email_forgot"
              />

              {/* Send Code Button */}
              <Button
                label={t("auth.forgotPassword.sendCodeButton")}
                disabled={!isEmailValid || !email || isLoading}
                onPress={sendVerificationCode}
                style={globalStyles.signInButton}
                isLoading={isLoading}
                qaId="button_send_code"
              />
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* App Version Text */}
        <Text {...testProps("text_app_version_forgot_password")} style={globalStyles.versionText}>
          {t("layout.shared.version")} {appVersion}
        </Text>
      </ScreenWrapper>
    </>
  );
}
