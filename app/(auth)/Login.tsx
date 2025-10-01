/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ImageSourcePropType,
} from "react-native";

// styles
import { globalStyles } from "@/theme/globalStyleSheet";
// hooks
import { useCDF } from "@/hooks/useCDF";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
// components
import { Input, Button, ScreenWrapper, Logo } from "@/components";

// images
import google from "@/assets/images/google.png";
import signinwithapple from "@/assets/images/apple.png";

import APP_CONFIG from "@/app.json";
import { validateEmail } from "@/utils/validations";
import { createPlatformEndpoint } from "@/utils/notifications";
import { CDF_EXTERNAL_PROPERTIES } from "@/utils/constants";
import { CDFConfig } from "@/rainmaker.config";

/**
 * LoginScreen component that displays the login screen.
 *
 * This component displays the login screen with a logo, input fields, and buttons.
 *
 */
export default function LoginScreen() {
  const ENABLED_OAUTH_PROVIDERS = APP_CONFIG.features.enabledOauth;
  const OAUTH_PROVIDER_IMAGES = {
    google: google,
    signinwithapple: signinwithapple,
  } as Record<string, ImageSourcePropType>;

  const { store, fetchNodesAndGroups } = useCDF();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const router = useRouter();
  const toast = useToast();

  const emailParam = typeof params.email === "string" ? params.email : "";
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const appVersion = APP_CONFIG.expo.version;

  /**
   * Validates password input
   * @param {string} password - The password to validate
   * @returns {{ isValid: boolean }} - Validation result
   */
  const passwordValidator = (
    password: string
  ): { isValid: boolean; error?: string } => {
    if (!password) {
      return { isValid: false };
    }

    return { isValid: true };
  };

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
   * Handles email field changes
   */
  const handleEmailChange = (value: string, isValid: boolean) => {
    setEmail(value.trim());
    setIsEmailValid(isValid);
  };

  /**
   * Handles password field changes
   */
  const handlePasswordChange = (value: string, isValid: boolean) => {
    setPassword(value.trim());
    setIsPasswordValid(isValid);
  };

  /**
   * Logs in the user.
   *
   * This function logs in the user with the email and password.
   *
   * SDK function used:
   * 1. login
   */
  const login = () => {
    // Check if form is valid before submitting
    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    setIsLoading(true);

    store.userStore
      .login(email, password)
      .then(async (res) => {
        if (res) {
          // Try to create platform endpoint, but don't block login if it fails
          try {
            await createPlatformEndpoint(store);
          } catch (error) {
            console.warn("Failed to create platform endpoint:", error);
            // Don't show error to user as login was successful
          }
          /*
          With CDFConfig.autoSync enabled, CDF login method will fetch the first page automatically,
          so we don't need to fetch the first page again
          */
          const shouldFetchFirstPage = !CDFConfig.autoSync;
          await fetchNodesAndGroups(shouldFetchFirstPage);
          // redirect to home screen
          router.replace("/(group)/Home");
        }
      })
      .catch((error) => {
        toast.showError(
          t("auth.errors.signInFailed"),
          error.description || t("auth.errors.fallback")
        );
      })
      .finally(() => {
        // reset loading state
        setIsLoading(false);
      });
  };

  /**
   * Navigates to the forgot password screen
   */
  const forgotPwd = () => {
    router.push("/(auth)/Forgot");
  };

  /**
   * Handles the OAuth login
   * @param {string} provider - The provider to login with
   *
   * SDK function used:
   * 1. loginWithOauth
   */
  const oauthLogin = async (provider: string) => {
    try {
      const authInstance = store.userStore.authInstance;
      if (!authInstance) {
        throw new Error("Auth instance not found");
      }

      const userInstance = await authInstance.loginWithOauth(provider);
      store.userStore[CDF_EXTERNAL_PROPERTIES.IS_OAUTH_LOGIN] = true;
      await store.userStore.setUserInstance(userInstance);

      // With CDFConfig.autoSync enabled, CDF setUserInstance method will fetch the first page automatically,
      // so we don't need to fetch the first page again
      const shouldFetchFirstPage = !CDFConfig.autoSync;
      await fetchNodesAndGroups(shouldFetchFirstPage);

      await createPlatformEndpoint(store);

      if (userInstance) {
        router.push("/(group)/Home");
      }
    } catch (error) {
      console.error(`OAuth login failed for provider ${provider}:`, error);

      // Handle different types of OAuth errors
      let errorMessage = "OAuth login failed. Please try again.";

      if (error instanceof Error) {
        if (error.message.includes("OAUTH_CANCELLED")) {
          errorMessage = "OAuth login was cancelled.";
        } else if (error.message.includes("NO_BROWSER_FOUND")) {
          errorMessage = "No browser app found. Please install a browser.";
        } else {
          errorMessage = `OAuth error: ${error.message}`;
        }
      }

      // Show error toast to user
      toast.showError("OAuth Login Failed", errorMessage);
    }
  };

  return (
    <ScreenWrapper style={globalStyles.screenWrapper} excludeTop={false}>
      <View style={globalStyles.scrollViewContent}>
        <Logo />
        <View style={globalStyles.inputContainer}>
          {/* Email Input */}
          <Input
            icon="mail-open"
            placeholder={t("auth.shared.emailPlaceholder")}
            initialValue={emailParam}
            onFieldChange={handleEmailChange}
            validator={emailValidator}
            validateOnChange={true}
            debounceDelay={500}
            inputMode="email"
          />

          {/* Password Input */}
          <Input
            icon="lock-closed"
            placeholder={t("auth.shared.passwordPlaceholder")}
            isPassword={true}
            onFieldChange={handlePasswordChange}
            validator={passwordValidator}
            validateOnChange={true}
          />

          {/* Sign In Button */}
          <Button
            label={t("auth.login.signInButton")}
            disabled={!isEmailValid || !isPasswordValid || isLoading}
            onPress={login}
            style={globalStyles.signInButton}
            isLoading={isLoading}
          />

          {/* Forgot Password Button */}
          <TouchableOpacity onPress={forgotPwd}>
            <Text style={globalStyles.forgotPasswordText}>
              {t("auth.login.forgotPassword")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* OAuth Buttons */}
        {ENABLED_OAUTH_PROVIDERS.length > 0 && (
          <>
            <Text style={globalStyles.thirdLoginText}>
              {t("auth.login.thirdPartyLogin")}
            </Text>
            <View style={globalStyles.oauthContainer}>
              {/* Enabled OAuth Providers */}
              {ENABLED_OAUTH_PROVIDERS.map((provider) => (
                <TouchableOpacity
                  key={provider}
                  onPress={() => oauthLogin(provider)}
                  style={globalStyles.oauthButton}
                >
                  <Image
                    source={OAUTH_PROVIDER_IMAGES[provider.toLocaleLowerCase()]}
                    style={globalStyles.oauthImage}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Sign Up Button */}
        <TouchableOpacity onPress={() => router.push("/(auth)/Signup")}>
          <Text style={globalStyles.linkText}>
            {t("auth.login.navigateToSignUp")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* App Version Text */}
      <Text style={globalStyles.versionText}>
        {t("layout.shared.version")} {appVersion}
      </Text>
    </ScreenWrapper>
  );
}
