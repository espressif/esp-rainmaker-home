/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useRouter } from "expo-router";
import { useCDF } from "@shared/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { Key, Trash2 } from "lucide-react-native";
import { Header, ScreenWrapper, DangerButton } from "@shared/components";
import { SettingsItem, SettingsSection } from "@features/user/components";
import { testProps } from "@shared/utils/testProps";
import { CDF_EXTERNAL_PROPERTIES } from "@shared/utils/constants";
import { getFeatures } from "@config/features.config";

/**
 * Renders the account security UI section.
 * Delete Account is SDK-gated (unavailable on Neo).
 */
const AccountSecurity: React.FC = () => {
  const router = useRouter();
  const { store } = useCDF();
  const { t } = useTranslation();
  const [isThirdPartyLogin, setIsThirdPartyLogin] = useState(false);
  const { accountDeletion } = getFeatures();

  useEffect(() => {
    setIsThirdPartyLogin(
      store?.userStore[CDF_EXTERNAL_PROPERTIES.IS_OAUTH_LOGIN] || false,
    );
  }, [store]);

  /**
   * Navigates to the change-password flow.
   */
  const handleChangePassword = () => {
    router.push("/(auth)/ChangePassword");
  };

  /**
   * Navigates to the delete-account flow when the SDK supports it.
   */
  const handleDeleteAccount = () => {
    router.push("/(user)/DeleteAccount");
  };

  return (
    <>
      <Header
        label={t("user.accountSecurity.title")}
        showBack={true}
        qaId="header_account_security"
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_account_security"
      >
        {!isThirdPartyLogin && (
          <SettingsSection qaId="section_account_security">
            <SettingsItem
              icon={<Key size={20} color={tokens.colors.primary} />}
              title={t("user.accountSecurity.changePassword")}
              type="navigation"
              onPress={handleChangePassword}
              showSeparator={false}
              qaId="change_password"
            />
          </SettingsSection>
        )}

        {accountDeletion && (
          <View
            {...testProps("view_account_security")}
            style={styles.deleteSection}
          >
            <DangerButton
              icon={<Trash2 size={20} color={tokens.colors.red} />}
              title={t("user.accountSecurity.deleteAccount")}
              onPress={handleDeleteAccount}
              qaId="delete_account"
            />
          </View>
        )}
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  deleteSection: {
    marginTop: tokens.spacing._15,
  },
});

export { AccountSecurity };
