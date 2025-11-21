/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { View, Pressable, ViewStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Icons
import { Settings, Bell, Shield, FileText } from "lucide-react-native";

// Components
import {
  Header,
  ContentWrapper,
  ScreenWrapper,
  SettingsSection,
  ProfileSection,
  IntegrationItem,
  UserOperationItem,
  LogoutButton,
  ConfirmationDialog,
} from "@/components";

// Utils
import { testProps } from "@/utils/testProps";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Navigation and i18n
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

// Store
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";

import { openUrl } from "@/utils/common";
import {
  CDF_EXTERNAL_PROPERTIES,
  PRIVACY_POLICY_LINK,
  TERMS_OF_USE_LINK,
} from "@/utils/constants";
import { deletePlatformEndpoint } from "@/utils/notifications";

// Types
import {
  UserProps,
  UserOperationConfig,
  IntegrationConfig,
} from "@/types/global";
import { ESPAPIError } from "@espressif/rainmaker-base-sdk";

type RouteMap = {
  handleSettings: "/(user)/Settings";
  handleAlexa: "/(user)/AlexaGuide";
  handleGoogleAssistant: "/(user)/GoogleAssistantGuide";
  handleNotificationCenter: "/(user)/NotificationCenter";
  handlePrivacyPolicy: () => void;
  handleTermsOfUse: () => void;
};

type RouteAction = keyof RouteMap;

/**
 * User Component
 *
 * Main user profile screen that displays user information, integrations, and operations.
 *
 * Features:
 * - User profile information display
 * - Third-party integrations
 * - User operations management
 * - Debug mode support
 * - Logout functionality
 * - Internationalization support
 */
const User: React.FC<UserProps> = () => {
  // Hooks
  const router = useRouter();
  const { t } = useTranslation();
  const { store } = useCDF();
  const toast = useToast();

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  // Configuration
  const userOperations: UserOperationConfig[] = [
    {
      id: "notifications",
      icon: <Bell size={20} color={tokens.colors.primary} />,
      title: t("user.notifications.title"),
      action: "handleNotificationCenter",
      showBadge: false,
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
  ];

  const integrations: IntegrationConfig[] = [
    {
      id: "alexa",
      title: "Alexa",
      icon: require("@/assets/images/alexa.png"),
      action: "handleAlexa",
    },
    {
      id: "google-assistant",
      title: "Google Assistant",
      icon: require("@/assets/images/google-assistant.png"),
      action: "handleGoogleAssistant",
    },
  ];
  // Navigation handlers
  const handleNavigation = (action: RouteAction) => {
    const routes: RouteMap = {
      handleSettings: "/(user)/Settings",
      handleAlexa: "/(user)/AlexaGuide",
      handleGoogleAssistant: "/(user)/GoogleAssistantGuide",
      handleNotificationCenter: "/(user)/NotificationCenter",
      handlePrivacyPolicy: () => openUrl(PRIVACY_POLICY_LINK),
      handleTermsOfUse: () => openUrl(TERMS_OF_USE_LINK),
    };

    if (action === "handlePrivacyPolicy" || action === "handleTermsOfUse") {
      routes[action]();
    } else {
      router.push(routes[action]);
    }
  };

  /**
   * Handle logout user, redirect to login screen
   *
   * SDK function used:
   * ESPRMUser.logout
   */
  const handleLogout = () => {
    setShowLogoutDialog(true);
  };

  const confirmLogout = async () => {
    try {
      setIsLoading(true);

      store.groupStore.currentHomeId = null;

      // Try to delete platform endpoint, but don't block logout if it fails
      try {
        await deletePlatformEndpoint(store);
      } catch (error) {
        console.warn("Failed to delete platform endpoint:", error);
        // Don't show error to user as logout should proceed
      }

      await store.userStore?.logout();

      if (store.userStore) {
        store.userStore.user = null;
        store.userStore.userInfo = null;
        store.userStore[CDF_EXTERNAL_PROPERTIES.IS_OAUTH_LOGIN] = false;
      }

      await AsyncStorage.clear();
      router.replace("/(auth)/Login");
    } catch (error) {
      toast.showError(
        t("user.errors.logoutFailed"),
        (error as ESPAPIError).description || t("user.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Render helpers
  const renderIntegrationItem = (integration: IntegrationConfig) => (
    <IntegrationItem
      key={integration.id}
      icon={integration.icon}
      title={integration.title}
      onPress={() => handleNavigation(integration.action)}
    />
  );

  const renderUserOperationItem = (
    operation: UserOperationConfig,
    index: number
  ) => {
    return (
      <UserOperationItem
        key={operation.id}
        icon={operation.icon}
        title={operation.title}
        onPress={() => handleNavigation(operation.action)}
        showBadge={operation.showBadge}
        isDebug={operation.isDebug}
        showSeparator={
          operation.showSeparator !== false && index < userOperations.length - 1
        }
      />
    );
  };

  /**
   * Render third-party integrations section
   * Integrations:
   * - Alexa
   * - Google Assistant
   */
  const renderThirdPartyIntegration = () => (
    <View
      {...testProps("view_user_integration")}
      style={[styles.section, { ...globalStyles.shadowElevationForLightTheme }]}
    >
      <ContentWrapper title={t("user.profile.thirdPartyIntegration.title")} qaId="3p_integration">
        <View
          {...testProps("view_3p_integration")}
          style={[
            globalStyles.flex,
            globalStyles.alignCenter,
            styles.integrationsContainer,
          ]}
        >
          {integrations.map(renderIntegrationItem)}
        </View>
      </ContentWrapper>
    </View>
  );

  /**
   * Render user operations
   * Options:
   * - Settings
   * - Notification Center
   * - Privacy Policy
   * - Terms of Use
   * - Debug mode (Component Showcase)
   */
  const renderUserOperations = () => (
    <View {...testProps("view_user_operations")} style={styles.section}>
      <SettingsSection>
        {userOperations.map(renderUserOperationItem)}
      </SettingsSection>
    </View>
  );

  /**
   * Render header right
   * Options:
   * - Settings
   */
  const renderHeaderRight = () => (
    <Pressable {...testProps("button_settings")} onPress={() => handleNavigation("handleSettings")}>
      <Settings size={24} color={tokens.colors.primary} />
    </Pressable>
  );

  // Render
  return (
    <>
      <Header
        label={t("user.profile.title")}
        showBack={false}
        rightSlot={renderHeaderRight()}
        qaId="header_user"
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
        excludeTop={true}
        qaId="screen_wrapper_user"
      >
        <ProfileSection
          userInfo={store?.userStore?.userInfo || undefined}
          onPress={() => handleNavigation("handleSettings")}
        />

        {renderThirdPartyIntegration()}
        {renderUserOperations()}

        <View
          {...testProps("view_user_logout")}
          style={[
            styles.section,
            { ...globalStyles.shadowElevationForLightTheme },
          ]}
        >
          <LogoutButton onPress={handleLogout} />
        </View>
      </ScreenWrapper>

      <ConfirmationDialog
        open={showLogoutDialog}
        description={t("user.profile.logoutModal.message")}
        confirmText={t("user.profile.logoutModal.confirmButton")}
        cancelText={t("user.profile.logoutModal.cancelButton")}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutDialog(false)}
        confirmColor={tokens.colors.red}
        isLoading={isLoading}
        qaId="logout_user"
      />
    </>
  );
};

// Styles
const styles = {
  section: {
    marginTop: tokens.spacing._15,
    backgroundColor: tokens.colors.bg5,
  } as ViewStyle,
  integrationsContainer: {
    paddingTop: tokens.spacing._10,
    paddingBottom: tokens.spacing._10,
  } as ViewStyle,
};

export default User;
