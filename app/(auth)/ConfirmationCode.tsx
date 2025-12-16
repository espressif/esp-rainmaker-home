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
import { testProps } from "@/utils/testProps";
import { executePostLoginPipeline } from "@/utils/postLoginPipeline";

/**
 * ConfirmationCodeScreen component that displays the confirmation code screen for signup.
 *
 * This component displays the confirmation code screen with a code input, a verify button, and a resend code button.
 * It handles email verification for new user signup only.
 *
 */
const ConfirmationCodeScreen = () => {
  const appVersion = APP_CONFIG.expo.version;

  const { t } = useTranslation();
  const { store, initUserCustomData, refreshESPRMUser, fetchNodesAndGroups } = useCDF();
  const { email, password = "" } = useLocalSearchParams();
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
   * This function sends a verification code to the user's email address for signup.
   * It checks if a countdown is active and prevents resending if it is.
   *
   * SDK function used:
   * 1. sendSignUpCode
   */
  const handleResendCode = () => {
    if (countdown > 0) return;

    setIsLoading(true);

    // Send verification code for signup
    store.userStore.authInstance
      ?.sendSignUpCode(email as string, password as string)
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
   * Handles the code verification functionality for signup.
   *
   * This function verifies the signup code and auto-logs in the user.
   *
   * SDK function used:
   * 1. confirmSignUp
   */
  const handleVerify = () => {
    // Check if the code is valid before submitting
    if (!isCodeValid || !code.trim()) {
      return;
    }

    setIsLoading(true);

    // Confirm signup
    store.userStore.authInstance
      ?.confirmSignUp(email as string, code)
      .then(async (res) => {
        if (res.status === "success") {
          toast.showSuccess(t("auth.signup.registrationSuccess"));
          // Auto-login after successful signup verification
          await loginUser();
        } else {
          toast.showError(
            t("auth.errors.signupConfirmationFailed"),
            res.description || t("auth.errors.fallback")
          );
        }
      })
      .catch((error) => {
        toast.showError(
          t("auth.errors.signupConfirmationFailed"),
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
    try {
      const res = await store.userStore.login(email as string, password as string);
      if (res) {
        router.dismissAll();
        await executePostLoginPipeline({
          store,
          router,
          refreshESPRMUser,
          fetchNodesAndGroups,
          initUserCustomData,
        });
      }
    } catch (error: any) {
      toast.showError(
        t("auth.errors.autoSignInFailed"),
        error.description || t("auth.errors.fallback")
      );
      setTimeout(() => {
        router.dismissTo({
          pathname: "/(auth)/Login",
          params: { email: email },
        });
      }, 10000);
    }
  };

  return (
    <>
      <Header showBack label={t("auth.verification.title")} qaId="header_confirmation_code" />
      <ScreenWrapper style={globalStyles.screenWrapper} qaId="screen_wrapper_confirmation_code">
        <ScrollView {...testProps("scroll_confirmation_code")} contentContainerStyle={globalStyles.scrollViewContent}>
          <Text {...testProps("text_title_confirmation_code")} style={[globalStyles.heading, globalStyles.verificationTitle]}>
            {t("auth.verification.heading")}
          </Text>
          <Text
            {...testProps("text_subtitle_confirmation_code")}
            style={[globalStyles.subHeading, globalStyles.verificationSubtitle]}
          >
            {t("auth.verification.subtitle", { email: email as string })}
          </Text>

          <View {...testProps("view_confirmation_code")} style={globalStyles.verificationContainer}>
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
              qaId="confirmation_code"
            />
          </View>

          {/* Verify Button */}
          <Button
            label={t("auth.verification.verifyButton")}
            onPress={handleVerify}
            style={globalStyles.verificationButton}
            disabled={!isCodeValid || isLoading}
            isLoading={isLoading}
            qaId="button_verify_confirmation_code"
          />

          {/* Resend Code Button with countdown */}
          <TouchableOpacity
            {...testProps("button_resend_confirmation_code")}
            onPress={handleResendCode}
            disabled={countdown > 0 || isLoading}
          >
            <Text
              {...testProps("text_confirmation_code")}
              style={[globalStyles.linkText, countdown > 0 && { opacity: 0.5 }]}
            >
              {countdown > 0
                ? `${t("auth.verification.resendCode")} (${countdown}s)`
                : t("auth.verification.resendCode")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        {/* App Version Text */}
        <Text {...testProps("text_app_version_settings")} style={globalStyles.versionText}>
          {t("layout.shared.version")} {appVersion}
        </Text>
      </ScreenWrapper>
    </>
  );
};

export default ConfirmationCodeScreen;
