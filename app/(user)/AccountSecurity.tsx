/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useRouter } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";

// Icons
import { Key, Trash2 } from "lucide-react-native";

// Components
import {
  Header,
  ScreenWrapper,
  SettingsItem,
  SettingsSection,
  DangerButton,
} from "@/components";
import { CDF_EXTERNAL_PROPERTIES } from "@/utils/constants";

/**
 * AccountSecurity
 *
 * Displays account security settings including password change and account deletion options
 * Handles third-party login cases by hiding password change option
 */
const AccountSecurity: React.FC = () => {
  // Hooks
  const router = useRouter();
  const { store } = useCDF();
  const { t } = useTranslation();

  // State
  const [isThirdPartyLogin, setIsThirdPartyLogin] = useState(false);

  // Effects
  useEffect(() => {
    // Initialize third party login status from store
    // You can get the third party login status from your store here
    setIsThirdPartyLogin(
      store?.userStore[CDF_EXTERNAL_PROPERTIES.IS_OAUTH_LOGIN] || false
    );
  }, [store]);

  // Handlers
  const handleChangePassword = () => {
    router.push("/(auth)/ChangePassword");
  };

  const handleDeleteAccount = () => {
    router.push("/(user)/DeleteAccount");
  };

  // Render
  return (
    <>
      <Header label={t("user.accountSecurity.title")} showBack={true} />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
      >
        {!isThirdPartyLogin && (
          <SettingsSection>
            <SettingsItem
              icon={<Key size={20} color={tokens.colors.bg3} />}
              title={t("user.accountSecurity.changePassword")}
              type="navigation"
              onPress={handleChangePassword}
              showSeparator={false}
            />
          </SettingsSection>
        )}

        <View style={styles.deleteSection}>
          <DangerButton
            icon={<Trash2 size={20} color={tokens.colors.red} />}
            title={t("user.accountSecurity.deleteAccount")}
            onPress={handleDeleteAccount}
          />
        </View>
      </ScreenWrapper>
    </>
  );
};

// Styles
const styles = StyleSheet.create({
  deleteSection: {
    marginTop: tokens.spacing._15,
  },
});

export default AccountSecurity;
