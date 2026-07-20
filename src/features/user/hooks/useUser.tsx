/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import StorageAdapter  from "@native-adaptors/implementations/ESPAsyncStorage";

// Icons
import { Bell, Shield, FileText, Bot } from "lucide-react-native";

// Hooks
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";

// Utils
import { openUrl } from "@shared/utils/common";
import {
  CDF_EXTERNAL_PROPERTIES,
  getPrivacyPolicyLink,
  getTermsOfUseLink,
} from "@shared/utils/constants";
import { unregisterForNotification } from "@shared/utils/notifications";
import { pipelineTask } from "@shared/utils/pipelineTask";

// Types
import { UserOperationConfig, IntegrationConfig } from "@src/types/global";
import { ESPCDFAPIError } from "@store";
import { getFeatures } from "@/config/features.config";

// Tokens
import { tokens } from "@shared/theme/tokens";

export type RouteMap = {
  handleSettings: "/(user)/Settings";
  handleAlexa: "/(user)/AlexaGuide";
  handleGoogleAssistant: "/(user)/GoogleAssistantGuide";
  handleNotificationCenter: "/(user)/NotificationCenter";
  handleAssistantSettings: "/(agent)/Settings";
  handlePrivacyPolicy: () => void;
  handleTermsOfUse: () => void;
};

export type RouteAction = keyof RouteMap;

/**
 * Manages user state and related actions.
 */
export const useUser = () => {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { setESPCDFUser, store } = useCDF();
  const toast = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const user = store?.userStore.user;
  const features = getFeatures();

  const userOperations: UserOperationConfig[] = [
    features.notifications && {
      id: "notifications",
      icon: <Bell size={20} color={tokens.colors.primary} />,
      title: t("user.notifications.title"),
      action: "handleNotificationCenter",
      showBadge: false,
    },
    features.aiAgent && {
      id: "assistant-settings",
      icon: <Bot size={20} color={tokens.colors.primary} />,
      title: t("user.settings.aiSettings"),
      action: "handleAssistantSettings",
    },
    {
      id: "privacy",
      icon: <Shield size={20} color={tokens.colors.primary} />,
      title: t("layout.shared.privacyPolicy"),
      action: "handlePrivacyPolicy",
    },
    {
      id: "terms",
      icon: <FileText size={20} color={tokens.colors.primary} />,
      title: t("layout.shared.termsOfUse"),
      action: "handleTermsOfUse",
    },
  ].filter(Boolean) as UserOperationConfig[];

  const integrations: IntegrationConfig[] = [
    features.voiceAssistants && {
      id: "alexa",
      title: "Alexa",
      icon: require("@assets/images/alexa.png"),
      action: "handleAlexa",
    },
    features.voiceAssistants && {
      id: "google-assistant",
      title: "Google Assistant",
      icon: require("@assets/images/google-assistant.png"),
      action: "handleGoogleAssistant",
    },
  ].filter(Boolean) as IntegrationConfig[];

  const handleNavigation = (action: RouteAction) => {
    const routes: RouteMap = {
      handleSettings: "/(user)/Settings",
      handleAlexa: "/(user)/AlexaGuide",
      handleGoogleAssistant: "/(user)/GoogleAssistantGuide",
      handleNotificationCenter: "/(user)/NotificationCenter",
      handleAssistantSettings: "/(agent)/Settings",
      handlePrivacyPolicy: () => openUrl(getPrivacyPolicyLink(i18n.language)),
      handleTermsOfUse: () => openUrl(getTermsOfUseLink(i18n.language)),
    };

    if (action === "handlePrivacyPolicy" || action === "handleTermsOfUse") {
      routes[action]();
    } else {
      router.push(routes[action]);
    }
  };

  const handleLogout = () => {
    setShowLogoutDialog(true);
  };

  const confirmLogout = async () => {
    try {
      setIsLoading(true);

      await pipelineTask(
        [
          {
            name: "clearCurrentHome",
            run: async () => {
              store.groupStore.currentHomeId = null;
            },
          },
          {
            name: "unregisterForNotification",
            run: async () => {
              await unregisterForNotification(store);
            },
            optional: true,
            background: true,
          },
          {
            name: "logoutUser",
            run: async () => {
              await user?.logout();
            },
            dependsOn: ["clearCurrentHome"],
          },
          {
            name: "clearUserData",
            run: async () => {
              if (user) {
                store.userStore[CDF_EXTERNAL_PROPERTIES.IS_OAUTH_LOGIN] = false;
              }
            },
            dependsOn: ["logoutUser"],
          },
          {
            name: "clearESPRMUser",
            run: async () => {
              setESPCDFUser(null);
            },
            dependsOn: ["clearUserData"],
          },
          {
            name: "clearAsyncStorage",
            run: async () => {
              await StorageAdapter.clear();
            },
            dependsOn: ["clearUserData"],
          },
        ],
        {
          onStart: (stepName) => {
            console.log(`[logout pipeline] start: ${stepName}`);
          },
          onComplete: (stepName) => {
            console.log(`[logout pipeline] complete: ${stepName}`);
          },
          onError: (stepName, error) => {
            console.error(`[logout pipeline] error in ${stepName}:`, error);
          },
          onProgress: (state) => {
            console.log(
              `[logout pipeline] progress ${state.completed}/${state.total} (last: ${state.lastFinished})`,
            );
          },
        },
      );

      setShowLogoutDialog(false);
      setIsLoading(false);
      setTimeout(() => {
        router.replace("/(auth)/Login");
      }, 100);
    } catch (error) {
      console.error("Logout error:", error);
      setShowLogoutDialog(false);
      toast.showError(
        t("user.errors.logoutFailed"),
        (error as ESPCDFAPIError).description || t("user.errors.fallback"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    features,
    userOperations,
    integrations,
    isLoading,
    showLogoutDialog,
    setShowLogoutDialog,
    handleNavigation,
    handleLogout,
    confirmLogout,
  };
};
