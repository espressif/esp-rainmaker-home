/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useCDF } from "@/hooks/useCDF";

// Components
import { Header, ScreenWrapper, Button, Input } from "@/components";

// Utils
import { useToast } from "@/hooks/useToast";

// Constants
import { SUCESS } from "@/utils/constants";
import { testProps } from "@/utils/testProps";

/**
 * DeleteAccount
 *
 * Handles the account deletion flow including:
 * - Initial confirmation
 * - Verification code request
 * - Code validation
 * - Account deletion confirmation
 */
const DeleteAccount: React.FC = () => {
  // Hooks
  const { t } = useTranslation();
  const router = useRouter();
  const { store } = useCDF();
  const toast = useToast();

  // State
  const [showVerification, setShowVerification] = useState(false);
  const [code, setCode] = useState("");
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Effects
  useEffect(() => {
    if (countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [countdown]);

  /**
   * Verification code validator - checks if the code meets requirements
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
        error: t("user.validation.invalidCode"),
      };
    }
    return { isValid: true };
  };

  /**
   * Code field change handler
   */
  const handleCodeChange = (value: string, isValid: boolean) => {
    setCode(value);
    setIsCodeValid(isValid);
  };

  /**
   * handleProceed
   *
   * Handles the account deletion flow including:
   * - Initial confirmation
   * - Verification code request
   *
   * SDK function:
   * - ESPRMUser.requestAccountDeletion
   */
  const handleProceed = () => {
    if (countdown > 0) return;
    setIsLoading(true);

    store.userStore.user
      ?.requestAccountDeletion()
      .then((res) => {
        if (res.status === SUCESS) {
          setShowVerification(true);
          setCountdown(60);
          toast.showSuccess(t("user.deleteAccount.verificationCodeSent"));
        } else {
          toast.showError(
            t("user.errors.verificationCodeSendFailed"),
            res.description || t("user.errors.fallback")
          );
        }
      })
      .catch((error) => {
        toast.showError(
          t("user.errors.verificationCodeSendFailed"),
          error.description || t("user.errors.fallback")
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  /**
   * handleVerify
   *
   * Handles the verification code validation and account deletion confirmation
   * dismiss to consent screen
   *
   * SDK function:
   * - ESPRMUser.confirmAccountDeletion
   */
  const handleVerify = async () => {
    // Check if the code is valid before submitting
    if (!isCodeValid || !code.trim()) {
      return;
    }

    setIsLoading(true);

    try {
      await store.userStore.user?.confirmAccountDeletion(code.trim());
      await AsyncStorage.clear();

      toast.showSuccess(t("user.deleteAccount.deleteConfirmed"));
      router.dismissTo("/(auth)/Login");
    } catch (error: any) {
      toast.showError(
        t("user.errors.accountDeletionFailed"),
        error.description || t("user.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Render helpers
  const renderVerificationContent = () => (
    <View {...testProps("view_verification_delete_account")} style={[globalStyles.flex1, globalStyles.itemCenter]}>
      <View {...testProps("view_content_delete_account")} style={[globalStyles.inputContainer, styles.verificationContent]}>
        <Text {...testProps("text_title_delete_account")} style={[globalStyles.heading, globalStyles.textCenter]}>
          {t("user.deleteAccount.verificationCodeSent")}
        </Text>
        <Text
          {...testProps("text_subtitle_delete_account")}
          style={[
            globalStyles.subHeading,
            globalStyles.textCenter,
            globalStyles.textGray,
          ]}
        >
          {t("user.deleteAccount.verificationCodeSubtitle", {
            email: store.userStore.userInfo?.username || "",
          })}
        </Text>

        <View {...testProps("view_input_delete_account")} style={globalStyles.inputWrapper}>
          {/* code input */}
          <Input
            initialValue={code}
            onFieldChange={handleCodeChange}
            validator={codeValidator}
            validateOnChange={true}
            debounceDelay={300}
            style={[globalStyles.input, styles.codeInput]}
            keyboardType="numeric"
            maxLength={6}
            autoFocus
            qaId="delete_account"
          />
        </View>

        <View {...testProps("view_buttons_delete_account")} style={[globalStyles.btnWrap, styles.buttonContainer]}>
          {/* verify button */}
          <Button
            label={t("user.deleteAccount.verifyButton")}
            onPress={handleVerify}
            style={globalStyles.buttonPrimary}
            disabled={!isCodeValid || !code || code.length !== 6 || isLoading}
            isLoading={isLoading}
            qaId="button_verify_delete_account"
          />
          {/* resend code button */}
          <TouchableOpacity
            {...testProps("button_resend_delete_account")}
            onPress={handleProceed}
            disabled={countdown > 0 || isLoading}
            style={styles.resendButton}
          >
            <Text
              {...testProps("text_counter_delete_account")}
              style={[
                globalStyles.linkText,
                countdown > 0 && globalStyles.btnDisabled,
              ]}
            >
              {countdown > 0
                ? `${t("user.deleteAccount.resendCode")} (${countdown}s)`
                : t("user.deleteAccount.resendCode")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  /**
   * Delete account warning
   *
   * @returns {React.ReactNode} - The initial content
   */
  const renderInitialContent = () => (
    <View {...testProps("view_initial_delete_account")} style={[globalStyles.flex1, globalStyles.itemCenter]}>
      <View {...testProps("view_notice_delete_account")} style={styles.contentContainer}>
        <Text
          {...testProps("text_title_notice")}
          style={[
            globalStyles.heading,
            globalStyles.textCenter,
            styles.warningTitle,
          ]}
        >
          ⚠️ {t("user.deleteAccount.notice")}
        </Text>
        <Text
          {...testProps("text_subtitle_notice")}
          style={[
            globalStyles.subHeading,
            globalStyles.textCenter,
            globalStyles.textGray,
          ]}
        >
          {t("user.deleteAccount.description")}
        </Text>
        <View {...testProps("view_action_delete_account")} style={styles.buttonContainer}>
          <Button
            label={t("user.deleteAccount.title")}
            onPress={handleProceed}
            style={globalStyles.buttonDanger}
            isLoading={isLoading}
            textStyle={globalStyles.buttonTextDanger}
            qaId="button_delete_account"
          />
        </View>
      </View>
    </View>
  );

  // Render
  return (
    <>
      <Header
        label={
          showVerification
            ? t("user.deleteAccount.verificationTitle")
            : t("user.deleteAccount.title")
        }
        showBack
        qaId="header_delete_account"
      />
      <ScreenWrapper style={globalStyles.screenWrapper} qaId="screen_wrapper_delete_account">
        {showVerification
          ? renderVerificationContent()
          : renderInitialContent()}
      </ScreenWrapper>
    </>
  );
};

// Styles
const styles = StyleSheet.create({
  warningTitle: {
    color: tokens.colors.red,
  },
  contentContainer: {
    width: "100%",
    paddingHorizontal: tokens.spacing._20,
    maxWidth: 400,
  },
  verificationContent: {
    paddingHorizontal: tokens.spacing._20,
    width: "100%",
    maxWidth: 400,
  },
  codeInput: {
    textAlign: "center",
    fontSize: tokens.fontSize.lg,
    letterSpacing: 8,
    paddingVertical: 0,
  },
  buttonContainer: {
    marginTop: tokens.spacing._20,
    width: "100%",
  },
  resendButton: {
    marginTop: tokens.spacing._10,
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._15,
  },
});

export default DeleteAccount;
