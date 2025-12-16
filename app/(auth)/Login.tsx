/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ImageSourcePropType,
  ActivityIndicator,
} from "react-native";

// styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";
// hooks
import { useCDF } from "@/hooks/useCDF";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
// components
import { Input, Button, ScreenWrapper, Logo } from "@/components";
// icons
import { UserCircle, X } from "lucide-react-native";
// images
import google from "@/assets/images/google.png";
import signinwithapple from "@/assets/images/apple.png";

import APP_CONFIG from "@/app.json";
import { validateEmail } from "@/utils/validations";
import { CDF_EXTERNAL_PROPERTIES } from "@/utils/constants";
import { testProps } from "@/utils/testProps";
import { executePostLoginPipeline } from "@/utils/postLoginPipeline";

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

  const { store, fetchNodesAndGroups, initUserCustomData, refreshESPRMUser } =
    useCDF();
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
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<{
    currentStep: string;
    completed: number;
    total: number;
    steps: Array<{ name: string; status: "pending" | "running" | "completed" | "failed" }>;
  } | null>(null);

  const appVersion = APP_CONFIG.expo.version;

  /**
   * Maps technical step names to user-friendly messages
   */
  const getFriendlyStepName = (stepName: string): string => {
    const stepMap: Record<string, string> = {
      refreshESPRMUser: t("auth.login.settingUpAccount") || "Setting up account",
      setUserTimeZone: t("auth.login.settingUpAccount") || "Setting up account",
      createPlatformEndpoint: t("auth.login.settingUpAccount") || "Setting up account",
      fetchNodesAndGroups: t("auth.login.settingUpHomes") || "Setting up homes",
      updateRefreshTokensForAllAIDevices: t("auth.login.settingUpNodes") || "Setting up nodes",
      initUserCustomData: t("auth.login.settingUpNodes") || "Setting up nodes",
      getAgentTermsAccepted: t("auth.login.gettingProfile") || "Getting profile",
    };
    return stepMap[stepName] || stepName;
  };

  /**
   * Gets the current friendly message based on pipeline progress
   */
  const getCurrentFriendlyMessage = (): string => {
    if (!pipelineProgress) {
      return t("auth.login.settingUpAccount") || "Setting up account";
    }
    
    // If we're on the last step (getUserProfileAndRoute), show "Finishing up"
    if (pipelineProgress.currentStep === "getUserProfileAndRoute") {
      return t("auth.login.finishingUp") || "Finishing up";
    }
    
    if (!pipelineProgress.currentStep) {
      return t("auth.login.settingUpAccount") || "Setting up account";
    }
    
    return getFriendlyStepName(pipelineProgress.currentStep);
  };

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
   * Updates email state when email param changes (e.g., when navigating from ResetPassword)
   */
  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
      // Validate the email when it's set from params
      const validation = emailValidator(emailParam);
      setIsEmailValid(validation.isValid);
    }
  }, [emailParam]);

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
  const login = async () => {
    // Check if form is valid before submitting
    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    setIsLoading(true);

    try {
      const res = await store.userStore.login(email, password);
      if (!res) {
        return;
      }

      await executePostLoginPipeline({
        store,
        router,
        refreshESPRMUser,
        fetchNodesAndGroups,
        initUserCustomData,
      });
    } catch (error: any) {
      toast.showError(
        t("auth.errors.signInFailed"),
        error?.description || t("auth.errors.fallback")
      );
    } finally {
      // reset loading state
      setIsLoading(false);
    }
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
    setIsOAuthLoading(true);
    setPipelineProgress(null);
    try {
      const authInstance = store.userStore.authInstance;
      if (!authInstance) {
        throw new Error("Auth instance not found");
      }

      const userInstance = await authInstance.loginWithOauth(provider);

      
      store.userStore[CDF_EXTERNAL_PROPERTIES.IS_OAUTH_LOGIN] = true;
      await store.userStore.setUserInstance(userInstance);

      if (userInstance) {
        // Initialize pipeline progress tracking
        const pipelineSteps = [
          { name: "refreshESPRMUser", status: "pending" as const },
          { name: "setUserTimeZone", status: "pending" as const },
          { name: "createPlatformEndpoint", status: "pending" as const },
          { name: "fetchNodesAndGroups", status: "pending" as const },
          { name: "updateRefreshTokensForAllAIDevices", status: "pending" as const },
          { name: "initUserCustomData", status: "pending" as const },
          { name: "getAgentTermsAccepted", status: "pending" as const },
          { name: "getUserProfileAndRoute", status: "pending" as const },
        ];

        setPipelineProgress({
          currentStep: "",
          completed: 0,
          total: pipelineSteps.length,
          steps: pipelineSteps,
        });

        await executePostLoginPipeline({
          store,
          router,
          refreshESPRMUser,
          fetchNodesAndGroups,
          initUserCustomData,
          onStepStart: (stepName) => {
            setPipelineProgress((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                currentStep: stepName,
                steps: prev.steps.map((step) =>
                  step.name === stepName ? { ...step, status: "running" as const } : step
                ),
              };
            });
          },
          onStepComplete: (stepName) => {
            setPipelineProgress((prev) => {
              if (!prev) return prev;
              const updatedSteps = prev.steps.map((step) =>
                step.name === stepName ? { ...step, status: "completed" as const } : step
              );
              const completed = updatedSteps.filter((s) => s.status === "completed").length;
              return {
                ...prev,
                currentStep: stepName,
                completed,
                steps: updatedSteps,
              };
            });
          },
          onProgress: (stepName, state) => {
            setPipelineProgress((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                currentStep: stepName,
                completed: state.completed,
                total: state.total,
              };
            });
          },
        });
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
      setPipelineProgress(null);
    } finally {
      // Hide loader when login completes (success or failure)
      setIsOAuthLoading(false);
    }
  };

  /**
   * Handles canceling OAuth login
   */
  const handleCancelOAuth = () => {
    setIsOAuthLoading(false);
    setPipelineProgress(null);
  };

  return (
    <ScreenWrapper style={globalStyles.screenWrapper} excludeTop={false}>
      {isOAuthLoading ? (
        <View style={[globalStyles.emptyStateContainer, { backgroundColor: tokens.colors.bg5, flex: 1 }]}>
          {/* Close Button - Top Right */}
          <View style={{ position: "absolute", top: 20, right: 20, zIndex: 10 }}>
            <TouchableOpacity
              onPress={handleCancelOAuth}
              style={{
                padding: 8,
                borderRadius: 20,
                backgroundColor: tokens.colors.bg5,
              }}
              {...testProps("button_close_oauth")}
            >
              <X size={24} color={tokens.colors.text_primary} />
            </TouchableOpacity>
          </View>

          {/* Main Content */}
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <View style={globalStyles.emptyStateIconContainer}>
              <UserCircle size={40} color={tokens.colors.primary} />
            </View>
            <Text style={[globalStyles.emptyStateTitle, { marginBottom: tokens.spacing._10 }]}>
              {t("auth.login.settingUpAccount")}
            </Text>
            <ActivityIndicator 
              size="large" 
              color={tokens.colors.primary} 
            />
          </View>

          {/* Pipeline Progress - Bottom */}
          {pipelineProgress && (
            <View style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: tokens.colors.bg5,
              padding: tokens.spacing._15,
              borderTopWidth: 1,
              borderTopColor: tokens.colors.borderColor,
            }}>
              {/* Current Step with Friendly Message */}
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <ActivityIndicator 
                  size="small" 
                  color={tokens.colors.text_secondary}
                  style={{ marginRight: tokens.spacing._10 }}
                />
                <Text style={{
                  fontSize: 15,
                  color: tokens.colors.text_secondary,
                  fontStyle: "italic",
                }}>
                  {getCurrentFriendlyMessage()}
                </Text>
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={globalStyles.scrollViewContent} {...testProps("view_login")}>
        <Logo qaId="logo_login" />
        <View style={globalStyles.inputContainer} {...testProps("view_input_login")}>
          {/* Email Input */}
          <Input
            key={emailParam || "email-input"}
            icon="mail-open"
            placeholder={t("auth.shared.emailPlaceholder")}
            initialValue={emailParam}
            onFieldChange={handleEmailChange}
            validator={emailValidator}
            validateOnChange={true}
            debounceDelay={500}
            inputMode="email"
            qaId="email"
          />

          {/* Password Input */}
          <Input
            icon="lock-closed"
            placeholder={t("auth.shared.passwordPlaceholder")}
            isPassword={true}
            onFieldChange={handlePasswordChange}
            validator={passwordValidator}
            validateOnChange={true}
            qaId="password"
          />

          {/* Sign In Button */}
          <Button
            label={t("auth.login.signInButton")}
            disabled={!isEmailValid || !isPasswordValid || isLoading}
            onPress={login}
            style={globalStyles.signInButton}
            isLoading={isLoading}
            qaId="button_login"
          />

          {/* Forgot Password Button */}
          <TouchableOpacity {...testProps("button_forgot_password")} onPress={forgotPwd}>
            <Text {...testProps("text_forgotpassword")} style={globalStyles.forgotPasswordText}>
              {t("auth.login.forgotPassword")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* OAuth Buttons */}
        {ENABLED_OAUTH_PROVIDERS.length > 0 && (
          <>
            <Text {...testProps("text_3plogin")} style={globalStyles.thirdLoginText}>
              {t("auth.login.thirdPartyLogin")}
            </Text>
            <View {...testProps("view_3plogin")} style={globalStyles.oauthContainer}>
              {/* Enabled OAuth Providers */}
              {ENABLED_OAUTH_PROVIDERS.map((provider) => (
                <TouchableOpacity
                  key={provider}
                  onPress={() => oauthLogin(provider)}
                  style={globalStyles.oauthButton}
                  {...testProps(`button_3p_${provider}`)}
                >
                  <Image
                    {...testProps(`image_3p_${provider}`)}
                    source={OAUTH_PROVIDER_IMAGES[provider.toLocaleLowerCase()]}
                    style={globalStyles.oauthImage}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Sign Up Button */}
        <TouchableOpacity {...testProps("button_signup")} onPress={() => router.push("/(auth)/Signup")}>
          <Text {...testProps("text_signup")} style={globalStyles.linkText}>
            {t("auth.login.navigateToSignUp")}
          </Text>
        </TouchableOpacity>

        {/* App Version Text */}
        <Text {...testProps("text_app_version_login")} style={globalStyles.versionText}>
          {t("layout.shared.version")} {appVersion}
        </Text>
      </View>
      )}
    </ScreenWrapper>
  );
}
