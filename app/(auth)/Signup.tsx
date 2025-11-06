/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

// constants
import {
  TERMS_OF_USE_LINK,
  PRIVACY_POLICY_LINK,
} from "@/utils/constants";
// styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";
// hooks
import { useRouter } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
// components
import { Input, Button, ScreenWrapper, Logo, Typo, Header } from "@/components";
import { Checkbox } from "react-native-paper";
// expo
import * as WebBrowser from "expo-web-browser";
import { testProps } from "@/utils/testProps";

import APP_CONFIG from "@/app.json";
import { validateEmail } from "@/utils/validations";

/**
 * SignupScreen component that displays the signup screen.
 *
 * This component displays the signup screen with a logo, input fields, and buttons.
 *
 */
export default function SignupScreen() {
  const { store } = useCDF();
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isConfirmPasswordValid, setIsConfirmPasswordValid] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const appVersion = APP_CONFIG.expo.version;

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
  const confirmPasswordValidator = (
    confirmPwd: string
  ): { isValid: boolean; error?: string } => {
    if (!confirmPwd.trim()) {
      return { isValid: false };
    }
    if (confirmPwd !== password) {
      return {
        isValid: false,
        error: t("auth.validation.passwordsDoNotMatch"),
      };
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
   * Handles password change
   */
  const handlePasswordChange = (value: string, isValid: boolean) => {
    setPassword(value.trim());
    setIsPasswordValid(isValid);
  };

  /**
   * Handles confirm password change
   */
  const handleConfirmPasswordChange = (value: string, isValid: boolean) => {
    setConfirmPassword(value.trim());
    setIsConfirmPasswordValid(isValid);
  };

  /**
   * Signs up the user.
   *
   * This function signs up the user with the email and password.
   *
   * SDK function used:
   * 1. sendSignUpCode
   */
  const signup = () => {
    // Check if all fields are valid before submitting
    if (
      !isEmailValid ||
      !isPasswordValid ||
      !isConfirmPasswordValid ||
      !consentChecked
    ) {
      return;
    }

    setIsLoading(true);

    // send sign up code
    store.userStore.authInstance
      ?.sendSignUpCode(email, password)
      .then((res) => {
        if (res.status === "success") {
          // redirect to code screen
          router.push({
            pathname: "/(auth)/ConfirmationCode",
            params: {
              email: email,
              password: password,
            },
          });
        } else {
          toast.showError(
            t("auth.errors.verificationCodeSendFailed"),
            res.description
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
   * Opens the Terms of Use link in a web browser
   */
  const showTerms = async () => {
    try {
      await WebBrowser.openBrowserAsync(TERMS_OF_USE_LINK);
    } catch (error) {
      console.error("Failed to open Terms of Use:", error);
    }
  };

  /**
   * Opens the Privacy Policy link in a web browser
   */
  const showPrivacy = async () => {
    try {
      await WebBrowser.openBrowserAsync(PRIVACY_POLICY_LINK);
    } catch (error) {
      console.error("Failed to open Privacy Policy:", error);
    }
  };

  return (
    <>
      <Header showBack label={t("auth.signup.title")} qaId="header_signup" />
      <ScreenWrapper style={globalStyles.screenWrapper} qaId="screen_wrapper_signup">
        <View {...testProps("view_signup")} style={globalStyles.scrollViewContent}>
          <Logo qaId="logo_signup" />

          <View {...testProps("view_input_signup")} style={globalStyles.inputContainer}>
            {/* Email Input */}
            <Input
              icon="mail-open"
              placeholder={t("auth.shared.emailPlaceholder")}
              onFieldChange={handleEmailChange}
              validator={emailValidator}
              validateOnChange={true}
              debounceDelay={500}
              inputMode="email"
              qaId="email"
            />

            {/* Password Input */}
            <Input
              isPassword
              icon="lock-closed"
              placeholder={t("auth.shared.passwordPlaceholder")}
              onFieldChange={handlePasswordChange}
              validator={passwordValidator}
              validateOnChange={true}
              debounceDelay={500}
              qaId="password"
            />

            {/* Confirm Password Input */}
            <Input
              isPassword
              icon="lock-closed"
              placeholder={t("auth.shared.confirmPasswordPlaceholder")}
              onFieldChange={handleConfirmPasswordChange}
              validator={confirmPasswordValidator}
              validateOnChange={true}
              debounceDelay={500}
              qaId="confirm_password"
            />

            {/* Consent Section */}
            <View {...testProps("view_consent")} style={styles.consentContainer}>
              <Checkbox.Android
                status={consentChecked ? "checked" : "unchecked"}
                onPress={() => setConsentChecked(!consentChecked)}
                color={tokens.colors.primary}
                uncheckedColor={tokens.colors.gray}
                {...testProps("checkbox_terms_consent")}
              />
              <View {...testProps("view_consent_text")} style={styles.consentTextContainer}>
                <Typo style={styles.consentText} qaId="typo_consent">
                  {t("auth.signup.consentText")}{" "}
                  <Typo style={styles.linkText} onPress={showTerms} qaId="typo_terms_of_use">
                    {t("layout.shared.termsOfUse")}
                  </Typo>{" "}
                  {t("auth.signup.consentAnd")}{" "}
                  <Typo style={styles.linkText} onPress={showPrivacy} qaId="typo_privacy_policy">
                    {t("layout.shared.privacyPolicy")}
                  </Typo>
                </Typo>
              </View>
            </View>

            {/* Sign Up Button */}
            <Button
              label={t("auth.signup.confirmButton")}
              disabled={
                !isEmailValid ||
                !isPasswordValid ||
                !isConfirmPasswordValid ||
                !email ||
                !password ||
                !confirmPassword ||
                !consentChecked ||
                isLoading
              }
              onPress={signup}
              style={globalStyles.signInButton}
              isLoading={isLoading}
              qaId="button_signup"
            />
          </View>

          <TouchableOpacity {...testProps("button_signin")} onPress={() => router.dismissTo("/(auth)/Login")}>
            <Text {...testProps("text_navigate_to_signin")} style={globalStyles.linkText}>
              {t("auth.signup.navigateToSignIn")}
            </Text>
          </TouchableOpacity>
        </View>
        {/* App Version Text */}
        <Text {...testProps("text_app_version_signup")} style={globalStyles.versionText}>
          {t("layout.shared.version")} {appVersion}
        </Text>
      </ScreenWrapper>
    </>
  );
}

const styles = StyleSheet.create({
  consentContainer: {
    width: "100%",
    marginVertical: tokens.spacing._15,
    flexDirection: "row",
    alignItems: "center",
  },
  consentTextContainer: {
    flex: 1,
  },
  consentText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.gray,
    lineHeight: 20,
  },
  linkText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.primary,
    textDecorationLine: "underline",
  },
});
