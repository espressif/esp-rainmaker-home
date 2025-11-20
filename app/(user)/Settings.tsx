/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// React and React Native imports
import React from "react";

// Navigation
import { useRouter } from "expo-router";

// Components
import { Header } from "@/components";
import { ScreenWrapper } from "@/components";
import { SettingsSection } from "@/components";
import { SettingsItem } from "@/components";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks and Store
import { useTranslation } from "react-i18next";
import { Info, Shield, User } from "lucide-react-native";
import { tokens } from "@/theme/tokens";

// Types
import {
  SettingItemConfig,
  ActionHandler,
  ActionHandlers,
} from "@/types/global";

type RouteMap = {
  handlePersonalInfo: "/(user)/PersonalInfo";
  handleAccountSecurity: "/(user)/AccountSecurity";
  handleAboutUs: "/(user)/AboutUs";
};

/**
 * Settings Component
 *
 * Main settings screen that displays various configuration options and navigation items.
 *
 * Features:
 * - Configurable settings items from settingsConfig
 * - Support for both navigation and toggle type settings
 * - Gateway status toggle with persistence
 * - Navigation to various settings screens
 * - Internationalization support
 */
const Settings: React.FC = () => {
  // Hooks
  const router = useRouter();
  const { t } = useTranslation();

  const settingsItems: SettingItemConfig[] = [
    {
      id: "personal-info",
      icon: <User size={20} color={tokens.colors.primary} />,
      title: t("user.settings.personalInformation"),
      type: "navigation",
      action: "handlePersonalInfo",
    },
    {
      id: "account-security",
      icon: <Shield size={20} color={tokens.colors.primary} />,
      title: t("user.settings.accountSecurity"),
      type: "navigation",
      action: "handleAccountSecurity",
    },
    {
      id: "about-us",
      icon: <Info size={20} color={tokens.colors.primary} />,
      title: t("user.settings.aboutUs"),
      type: "navigation",
      action: "handleAboutUs",
      showSeparator: false,
    },
  ];

  /**
   * handleNavigation
   *
   * Handles the navigation to the selected route
   *
   * @param action - The action to handle
   */
  const handleNavigation = (action: keyof RouteMap) => {
    const routes: RouteMap = {
      handlePersonalInfo: "/(user)/PersonalInfo",
      handleAccountSecurity: "/(user)/AccountSecurity",
      handleAboutUs: "/(user)/AboutUs",
    };

    // navigate to the selected route
    router.push(routes[action]);
  };

  /**
   * getActionHandler
   *
   * Returns the action handler for the given action
   *
   * @param action - The action to handle
   * @returns {ActionHandler | undefined} - The action handler
   */
  const getActionHandler = (action: string): ActionHandler | undefined => {
    const handlers: ActionHandlers = {
      handlePersonalInfo: () => handleNavigation("handlePersonalInfo"),
      handleAccountSecurity: () => handleNavigation("handleAccountSecurity"),
      handleAboutUs: () => handleNavigation("handleAboutUs"),
    };
    return handlers[action];
  };

  // Render helpers
  const renderSettingsItem = (item: (typeof settingsItems)[0]) => (
    <SettingsItem
      key={item.id}
      icon={item.icon}
      title={item.title}
      type={item.type}
      onPress={
        item.type === "navigation"
          ? (getActionHandler(item.action) as () => void)
          : undefined
      }
      showSeparator={item.showSeparator}
    />
  );

  // Render
  return (
    <>
      <Header label={t("user.settings.title")} showBack={true} />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
      >
        <SettingsSection>
          {settingsItems.map(renderSettingsItem)}
        </SettingsSection>
      </ScreenWrapper>
    </>
  );
};

export default Settings;
