/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { globalStyles } from "@shared/theme/globalStyleSheet";

import { useResetPassword } from "@features/auth/hooks";

import { ScreenWrapper, Header, Input, Button } from "@shared/components";
import { ResendCodeButton, AppVersionText } from "@features/auth/components";
import { testProps } from "@shared/utils/testProps";
import {
  AUTO_COMPLETE_NEW_PASSWORD,
  AUTO_COMPLETE_SMS_OTP,
  IMPORTANT_FOR_AUTOFILL_YES,
  TEXT_CONTENT_TYPE_NEW_PASSWORD,
  TEXT_CONTENT_TYPE_ONE_TIME_CODE,
} from "@shared/utils/constants";

/**
 * Renders the reset password screen UI section.
 */
export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { username } = useLocalSearchParams();
  const {
    code,
    newPassword,
    confirmPassword,
    isCodeValid,
    isPasswordValid,
    isConfirmPasswordValid,
    isLoading,
    countdown,
    codeValidator,
    passwordValidator,
    confirmPasswordValidator,
    handleCodeChange,
    handlePasswordChange,
    handleConfirmPasswordChange,
    handleResendCode,
    handleResetPassword,
  } = useResetPassword();

  const newPasswordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  const isFormValid =
    isCodeValid && isPasswordValid && isConfirmPasswordValid && !isLoading;

  return (
    <>
      <Header
        showBack
        label={t("auth.forgotPassword.resetTitle")}
        qaId="header_reset_password"
      />
      <ScreenWrapper
        style={globalStyles.screenWrapper}
        qaId="screen_wrapper_reset_password"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={globalStyles.authKeyboardView}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ScrollView
            {...testProps("scroll_reset_password")}
            contentContainerStyle={globalStyles.scrollViewContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              {...testProps("text_title_reset_password")}
              style={[globalStyles.heading, globalStyles.verificationTitle]}
            >
              {t("auth.forgotPassword.resetHeading")}
            </Text>
            <Text
              {...testProps("text_subtitle_reset_password")}
              style={[
                globalStyles.subHeading,
                globalStyles.verificationSubtitle,
              ]}
            >
              {t("auth.verification.subtitle", {
                username: username as string,
              })}
            </Text>

            <View
              {...testProps("view_reset_password")}
              style={globalStyles.verificationContainer}
            >
              <Input
                initialValue={code}
                onFieldChange={handleCodeChange}
                validator={codeValidator}
                validateOnChange={true}
                debounceDelay={500}
                style={[
                  globalStyles.verificationInput,
                  globalStyles.verificationInputWithLetterSpacing,
                ]}
                keyboardType="numeric"
                maxLength={6}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={TEXT_CONTENT_TYPE_ONE_TIME_CODE}
                autoComplete={AUTO_COMPLETE_SMS_OTP}
                importantForAutofill={IMPORTANT_FOR_AUTOFILL_YES}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (isCodeValid) {
                    newPasswordInputRef.current?.focus();
                  }
                }}
                autoFocus
                qaId="reset_password_code"
              />
            </View>

            <View
              {...testProps("view_input_reset_password")}
              style={globalStyles.inputContainer}
            >
              <Input
                ref={newPasswordInputRef}
                isPassword
                icon="lock-closed"
                placeholder={t("auth.shared.newPasswordPlaceholder")}
                onFieldChange={handlePasswordChange}
                validator={passwordValidator}
                validateOnChange={true}
                debounceDelay={500}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={TEXT_CONTENT_TYPE_NEW_PASSWORD}
                autoComplete={AUTO_COMPLETE_NEW_PASSWORD}
                importantForAutofill={IMPORTANT_FOR_AUTOFILL_YES}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (isPasswordValid) {
                    confirmPasswordInputRef.current?.focus();
                  }
                }}
                qaId="new_password_reset_password"
              />

              <Input
                key={newPassword}
                ref={confirmPasswordInputRef}
                isPassword
                icon="lock-closed"
                placeholder={t("auth.shared.confirmPasswordPlaceholder")}
                initialValue={confirmPassword}
                onFieldChange={handleConfirmPasswordChange}
                validator={confirmPasswordValidator}
                validateOnChange={true}
                debounceDelay={500}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={TEXT_CONTENT_TYPE_NEW_PASSWORD}
                autoComplete={AUTO_COMPLETE_NEW_PASSWORD}
                importantForAutofill={IMPORTANT_FOR_AUTOFILL_YES}
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (isFormValid) {
                    void handleResetPassword();
                  }
                }}
                qaId="confirm_password_reset_password"
              />

              <Button
                label={t("auth.forgotPassword.confirmButton")}
                onPress={handleResetPassword}
                style={globalStyles.verificationButtonWithMarginTop}
                disabled={!isFormValid}
                isLoading={isLoading}
                qaId="button_reset_password"
              />

              <ResendCodeButton
                countdown={countdown}
                onPress={handleResendCode}
                disabled={isLoading}
                resendLabel={t("auth.verification.resendCode")}
                testId="button_resend_reset_password"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <AppVersionText testId="text_app_version_reset_password" />
      </ScreenWrapper>
    </>
  );
}
