/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ComponentProps, useContext, useMemo, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ImageSourcePropType,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";

import { useLogin } from "@features/auth/hooks";
import { getAuthAllowedUsernameTypes } from "@features/auth/utils/authHelper";
import { getEnabledOAuthProviders } from "@/config/features.config";
import { isCnRegion } from "@config/region.config";
import { runtimeConfigManager } from "@config/runtime.config";
import { cdfBootstrap } from "@integrations";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import { AppRestartContext } from "@context/appRestart.context";

import {
  ScreenWrapper,
  Input,
  Button,
  Logo,
  ConfirmationDialog,
} from "@shared/components";
import { OAuthLoadingOverlay, AppVersionText } from "@features/auth/components";
import { testProps } from "@shared/utils/testProps";

import google from "@assets/images/google.png";
import signinwithapple from "@assets/images/apple.png";
import wechat from "@assets/images/wechat.png";

const OAUTH_PROVIDER_IMAGES: Record<string, ImageSourcePropType> = {
  google,
  signinwithapple,
  wechat,
};

// Per-provider metadata for the CN OAuth-only tiles: brand name (not
// translated), brand color for the icon circle, and the Ionicons brand glyph.
const OAUTH_TILE_META: Record<
  string,
  { label: string; color: string; icon: ComponentProps<typeof Ionicons>["name"] }
> = {
  google: { label: "Google", color: "#DB4437", icon: "logo-google" },
  signinwithapple: { label: "Apple", color: "#000000", icon: "logo-apple" },
  wechat: { label: "WeChat", color: "#07C160", icon: "logo-wechat" },
};

/**
 * Renders the login screen UI section.
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ENABLED_OAUTH_PROVIDERS = getEnabledOAuthProviders();
  const { restartApp } = useContext(AppRestartContext);

  const {
    email,
    password,
    usernameParam,
    authFieldsKey,
    isEmailValid,
    isPasswordValid,
    isLoading,
    isOAuthLoading,
    monitorOAuthAppLifecycle,
    showConfigResetDialog,
    isConfigResetting,
    setShowConfigResetDialog,
    setIsConfigResetting,
    emailValidator,
    passwordValidator,
    handleEmailChange,
    handlePasswordChange,
    login,
    forgotPwd,
    oauthLogin,
    handleOAuthAppBecameActive,
    handleCancelOAuth,
    handleConfigReset,
    getCurrentFriendlyMessage,
  } = useLogin();

  const passwordInputRef = useRef<TextInput>(null);

  // CN-region builds omit the email / password credential login. Only the
  // remaining login options (e.g. OAuth / sign-up) are shown.
  const hideCredentialLogin = isCnRegion();

  const usernameFieldProps = useMemo(() => {
    const allowsPhone = getAuthAllowedUsernameTypes().includes("phone");
    return {
      placeholder: allowsPhone
        ? t("auth.shared.emailOrPhonePlaceholder")
        : t("auth.shared.emailPlaceholder"),
      inputMode: (allowsPhone ? "text" : "email") as "text" | "email",
      keyboardType: allowsPhone ? ("default" as const) : ("email-address" as const),
    };
  }, [t]);

  const handleConfigResetConfirm = async () => {
    setIsConfigResetting(true);
    try {
      await runtimeConfigManager.reset();
      await asyncStorageAdapter.clear();
      cdfBootstrap.reset();
      restartApp();
    } finally {
      setIsConfigResetting(false);
    }
  };

  return (
    <ScreenWrapper style={globalStyles.screenWrapper} excludeTop={false}>
      {isOAuthLoading ? (
        <OAuthLoadingOverlay
          onClose={handleCancelOAuth}
          message={t("auth.login.settingUpAccount")}
          progressMessage={getCurrentFriendlyMessage()}
          monitorAppLifecycle={monitorOAuthAppLifecycle}
          onAppBecameActive={handleOAuthAppBecameActive}
        />
      ) : (
        <View
          style={globalStyles.scrollViewContent}
          {...testProps("view_login")}
        >
          <Logo
            qaId="logo_login"
            onConfigTrigger={() => router.push("/(config)/ConfigScan" as never)}
            onConfigReset={handleConfigReset}
          />
          <View
            style={globalStyles.inputContainer}
            {...testProps("view_input_login")}
          >
            {!hideCredentialLogin && (
              <>
                <Input
                  key={`login-email-${authFieldsKey}-${usernameParam || "n"}`}
                  icon="mail-open"
                  placeholder={usernameFieldProps.placeholder}
                  initialValue={email}
                  onFieldChange={handleEmailChange}
                  validator={emailValidator}
                  validateOnBlur={true}
                  inputMode={usernameFieldProps.inputMode}
                  keyboardType={usernameFieldProps.keyboardType}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    if (isEmailValid) {
                      passwordInputRef.current?.focus();
                    }
                  }}
                  qaId="email"
                />

                <Input
                  ref={passwordInputRef}
                  key={`login-pw-${authFieldsKey}`}
                  icon="lock-closed"
                  placeholder={t("auth.shared.passwordPlaceholder")}
                  isPassword={true}
                  initialValue={password}
                  onFieldChange={handlePasswordChange}
                  validator={passwordValidator}
                  validateOnBlur={true}
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (isEmailValid && isPasswordValid && !isLoading) {
                      void login();
                    }
                  }}
                  qaId="password"
                />

                <Button
                  label={t("auth.login.signInButton")}
                  disabled={!isEmailValid || !isPasswordValid || isLoading}
                  onPress={login}
                  style={globalStyles.signInButton}
                  isLoading={isLoading}
                  qaId="button_login"
                />
              </>
            )}

            {!hideCredentialLogin && (
              <TouchableOpacity
                {...testProps("button_forgot_password")}
                onPress={forgotPwd}
              >
                <Text
                  {...testProps("text_forgot_password")}
                  style={globalStyles.forgotPasswordText}
                >
                  {t("auth.login.forgotPassword")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {ENABLED_OAUTH_PROVIDERS.length > 0 &&
            (hideCredentialLogin ? (
              // CN / OAuth-only: providers are the primary login, shown as
              // full-width tiles (icon + label + chevron) under a heading.
              <View
                style={globalStyles.oauthTilesSection}
                {...testProps("view_3plogin")}
              >
                <Text style={globalStyles.oauthTilesHeading}>
                  {t("auth.login.signInToContinue")}
                </Text>
                <Text style={globalStyles.oauthTilesSubheading}>
                  {t("auth.login.chooseSignInMethod")}
                </Text>
                {ENABLED_OAUTH_PROVIDERS.map((provider) => {
                  const key = provider.toLocaleLowerCase();
                  const meta = OAUTH_TILE_META[key];
                  return (
                    <TouchableOpacity
                      key={provider}
                      onPress={() => oauthLogin(provider)}
                      style={[
                        globalStyles.oauthButtonFull,
                        { backgroundColor: meta?.color ?? tokens.colors.primary },
                      ]}
                      {...testProps(`button_3p_${provider}`)}
                    >
                      <Ionicons
                        name={meta?.icon ?? "person-circle"}
                        size={20}
                        color={tokens.colors.white}
                        {...testProps(`image_3p_${provider}`)}
                      />
                      <Text style={globalStyles.oauthButtonFullText}>
                        {t("auth.login.continueWith", {
                          provider: meta?.label ?? provider,
                        })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              // Global: credential login is primary; OAuth is a secondary row of icons.
              <>
                <Text
                  {...testProps("text_3plogin")}
                  style={globalStyles.thirdLoginText}
                >
                  {t("auth.login.thirdPartyLogin")}
                </Text>
                <View
                  {...testProps("view_3plogin")}
                  style={globalStyles.oauthContainer}
                >
                  {ENABLED_OAUTH_PROVIDERS.map((provider) => (
                    <TouchableOpacity
                      key={provider}
                      onPress={() => oauthLogin(provider)}
                      style={globalStyles.oauthButton}
                      {...testProps(`button_3p_${provider}`)}
                    >
                      <Image
                        {...testProps(`image_3p_${provider}`)}
                        source={
                          OAUTH_PROVIDER_IMAGES[provider.toLocaleLowerCase()]
                        }
                        style={globalStyles.oauthImage}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ))}

          {!hideCredentialLogin && (
            <TouchableOpacity
              {...testProps("button_signup")}
              onPress={() => router.push("/(auth)/Signup")}
            >
              <Text {...testProps("text_signup")} style={globalStyles.linkText}>
                {t("auth.login.navigateToSignUp")}
              </Text>
            </TouchableOpacity>
          )}

          <AppVersionText testId="text_app_version_login" />
        </View>
      )}

      <ConfirmationDialog
        open={showConfigResetDialog}
        title={t("config.reset.title")}
        description={t("config.reset.message")}
        confirmText={t("config.reset.confirmButton")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={handleConfigResetConfirm}
        onCancel={() => setShowConfigResetDialog(false)}
        confirmColor={tokens.colors.red}
        isLoading={isConfigResetting}
        qaId="config_reset"
      />
    </ScreenWrapper>
  );
}
