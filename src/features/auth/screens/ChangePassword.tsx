/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef } from "react";
import { View, TextInput } from "react-native";
import { useTranslation } from "react-i18next";

import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useDeploymentBranding } from "@features/landing";

import { useChangePassword } from "@features/auth/hooks";

import {
  ScreenWrapper,
  Header,
  Input,
  Button,
  Logo,
} from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import {
  AUTO_COMPLETE_NEW_PASSWORD,
  AUTO_COMPLETE_PASSWORD,
  IMPORTANT_FOR_AUTOFILL_YES,
  TEXT_CONTENT_TYPE_NEW_PASSWORD,
  TEXT_CONTENT_TYPE_PASSWORD,
} from "@shared/utils/constants";

/**
 * Renders the change password screen UI section.
 */
export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const {
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
  } = useChangePassword();

  const newPasswordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  // Same deployment mark as Login, so changing an ESP RainMaker Classic /
  // Neo password shows that deployment's logo rather than the generic app
  // lockup.
  const { deploymentLabel, deploymentWordmark } = useDeploymentBranding();

  const isFormValid =
    isOldPasswordValid &&
    isNewPasswordValid &&
    isConfirmPasswordValid &&
    !!oldPassword &&
    !!newPassword &&
    !!confirmPassword &&
    !isLoading;

  return (
    <>
      <Header
        label={t("auth.changePassword.title")}
        showBack
        qaId="header_change_password"
      />
      <ScreenWrapper
        style={globalStyles.screenWrapper}
        qaId="screen_wrapper_change_password"
      >
        <View
          {...testProps("view_change_password")}
          style={[
            globalStyles.scrollViewContent,
            globalStyles.authScrollViewContentWithPadding,
          ]}
        >
          <Logo
            qaId="logo_change_password"
            caption={deploymentLabel}
            captionSource={deploymentWordmark}
          />
          <View
            {...testProps("view_input_change_password")}
            style={globalStyles.inputContainer}
          >
            <Input
              isPassword
              icon="lock-closed"
              placeholder={t("auth.changePassword.currentPasswordPlaceholder")}
              onFieldChange={handleOldPasswordChange}
              validator={oldPasswordValidator}
              validateOnChange={true}
              debounceDelay={500}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={TEXT_CONTENT_TYPE_PASSWORD}
              autoComplete={AUTO_COMPLETE_PASSWORD}
              importantForAutofill={IMPORTANT_FOR_AUTOFILL_YES}
              returnKeyType="next"
              onSubmitEditing={() => {
                if (isOldPasswordValid) {
                  newPasswordInputRef.current?.focus();
                }
              }}
              qaId="current_password"
            />
            <Input
              ref={newPasswordInputRef}
              isPassword
              icon="lock-closed"
              placeholder={t("auth.shared.newPasswordPlaceholder")}
              onFieldChange={handleNewPasswordChange}
              validator={newPasswordValidator}
              validateOnChange={true}
              debounceDelay={500}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={TEXT_CONTENT_TYPE_NEW_PASSWORD}
              autoComplete={AUTO_COMPLETE_NEW_PASSWORD}
              importantForAutofill={IMPORTANT_FOR_AUTOFILL_YES}
              returnKeyType="next"
              onSubmitEditing={() => {
                if (isNewPasswordValid) {
                  confirmPasswordInputRef.current?.focus();
                }
              }}
              qaId="new_password"
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
              debounceDelay={50}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={TEXT_CONTENT_TYPE_NEW_PASSWORD}
              autoComplete={AUTO_COMPLETE_NEW_PASSWORD}
              importantForAutofill={IMPORTANT_FOR_AUTOFILL_YES}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (isFormValid) {
                  void handleSubmit();
                }
              }}
              qaId="confirm_password"
            />
            <Button
              label={t("auth.changePassword.updateButton")}
              onPress={handleSubmit}
              disabled={!isFormValid}
              style={globalStyles.signInButton}
              isLoading={isLoading}
              qaId="button_update_change_password"
            />
          </View>
        </View>
      </ScreenWrapper>
    </>
  );
}
