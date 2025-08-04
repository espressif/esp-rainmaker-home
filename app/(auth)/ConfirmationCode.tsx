/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

// styles
import { globalStyles } from "@/theme/globalStyleSheet";
// hooks
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";
// components
import { ScreenWrapper, Header, Input, Button } from "@/components";

import APP_CONFIG from "@/app.json";
import { SIGNUP_CODE_TYPE, RESET_PASSWORD_CODE_TYPE } from "@/utils/constants";

/**
 * ConfirmationCodeScreen component that displays the confirmation code screen.
 *
 * This component displays the confirmation code screen with a code input, a verify button, and a resend code button.
 * It also displays the countdown timer for the code verification process.
 *
 */
const ConfirmationCodeScreen = () => {
  const appVersion = APP_CONFIG.expo.version;

  const { t } = useTranslation();
  const { store } = useCDF();
  const { email, password = "", type } = useLocalSearchParams();
  const toast = useToast();

  const [code, setCode] = useState("");
  const [isCodeValid, setIsCodeValid] = useState(false);
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
   * Handles code change
   */
  const handleCodeChange = (value: string, isValid: boolean) => {
    setCode(value);
    setIsCodeValid(isValid);
  };

  /**
   * Handles the countdown timer for the code verification process.
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
   * This function sends a verification code to the user's email address.
   * It checks if a countdown is active and prevents resending if it is.
   *
   * SDK function used:
   * 1. sendSignUpCode
   * 2. forgotPassword
   */
  const handleResendCode = () => {
    if (countdown > 0) return;

    setIsLoading(true);

    // Send verification code - if signup, send signup code, if reset password, send forgot password code
    store.userStore.authInstance?.[
      type === SIGNUP_CODE_TYPE ? "sendSignUpCode" : "forgotPassword"
    ](email as string, password as string)
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
   * Handles the code verification functionality.
   *
   * This function verifies the code input and redirects to the login page if successful.
   *
   * SDK function used:
   * 1. confirmSignUp
   * 2. setNewPassword
   */
  const handleVerify = () => {
    // Check if the code is valid before submitting
    if (!isCodeValid || !code.trim()) {
      return;
    }

    let successMessage: string = "";

    setIsLoading(true);

    // confirm method - if signup - confirm signup, if reset password, set new password
    const confirmMethod = () => {
      if (type === SIGNUP_CODE_TYPE) {
        successMessage = t("auth.signup.registrationSuccess");
        return store.userStore.authInstance?.confirmSignUp(
          email as string,
          code
        );
      } else if (type === RESET_PASSWORD_CODE_TYPE) {
        successMessage = t("auth.forgotPassword.resetSuccess");
        return store.userStore.authInstance?.setNewPassword(
          email as string,
          password as string,
          code
        );
      }
    };

    const result = confirmMethod();
    if (!result) {
      toast.showError(t("auth.errors.authInstanceNotInitialized"));
      setIsLoading(false);
      return;
    }

    result
      .then((res) => {
        if (res.status === "success") {
          toast.showSuccess(successMessage);
          // redirect to login page
          if (type === SIGNUP_CODE_TYPE) {
            loginUser();
          } else {
            router.dismissTo({
              pathname: "/(auth)/Login",
              params: { email: email },
            });
          }
        } else {
          const errorMessage =
            type === SIGNUP_CODE_TYPE
              ? t("auth.errors.signupConfirmationFailed")
              : t("auth.errors.passwordResetFailed");
          toast.showError(
            errorMessage,
            res.description || t("auth.errors.fallback")
          );
        }
      })
      .catch((error) => {
        const errorMessage =
          type === SIGNUP_CODE_TYPE
            ? t("auth.errors.signupConfirmationFailed")
            : t("auth.errors.passwordResetFailed");
        toast.showError(
          errorMessage,
          error.description || t("auth.errors.fallback")
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  /*
   * Auto-authenticates the user.
   *
   * This function authenticates the user with the email and password.
   * If the authentication is successful, the user is redirected to the home screen.
   * If the authentication is not successful, the user is redirected to the login screen.
   *
   * SDK function used:
   * 1. login
   */
  const loginUser = async () => {
    store.userStore
      .login(email as string, password as string)
      .then((res) => {
        if (res) {
          router.dismissAll();
          // redirect to home screen
          router.replace("/(group)/Home");
        }
      })
      .catch((error) => {
        toast.showError(
          t("auth.errors.autoSignInFailed"),
          error.description || t("auth.errors.fallback")
        );
        setTimeout(() => {
          router.dismissTo({
            pathname: "/(auth)/Login",
            params: { email: email },
          });
        }, 1000);
      });
  };

  return (
    <>
      <Header showBack label={t("auth.verification.title")} />
      <ScreenWrapper style={globalStyles.screenWrapper}>
        <ScrollView contentContainerStyle={globalStyles.scrollViewContent}>
          <Text style={[globalStyles.heading, globalStyles.verificationTitle]}>
            {t("auth.verification.heading")}
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

          {/* Verify Button */}
          <Button
            label={t("auth.verification.verifyButton")}
            onPress={handleVerify}
            style={globalStyles.verificationButton}
            disabled={!isCodeValid || isLoading}
            isLoading={isLoading}
          />

          {/* Resend Code Button with countdown */}
          <TouchableOpacity
            onPress={handleResendCode}
            disabled={countdown > 0 || isLoading}
          >
            <Text
              style={[globalStyles.linkText, countdown > 0 && { opacity: 0.5 }]}
            >
              {countdown > 0
                ? `${t("auth.verification.resendCode")} (${countdown}s)`
                : t("auth.verification.resendCode")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        {/* App Version Text */}
        <Text style={globalStyles.versionText}>
          {t("layout.shared.version")} {appVersion}
        </Text>
      </ScreenWrapper>
    </>
  );
};

export default ConfirmationCodeScreen;
