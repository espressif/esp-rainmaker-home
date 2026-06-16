/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ScrollView, View } from "react-native";

import { Header, ScreenWrapper, ConfirmationDialog } from "@shared/components";
import {
  LogoutButton,
  ProfileSection,
  UserIntegrationSection,
  UserOperationsSection,
  UserHeaderRight,
} from "@features/user/components";
import { useUser, type RouteAction } from "@features/user/hooks";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { userStyles } from "@features/user/theme/userStyleSheet";
import { testProps } from "@shared/utils/testProps";

const User: React.FC = observer(() => {
  const { t } = useTranslation();
  const {
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
  } = useUser();

  return (
    <>
      <Header
        label={t("user.profile.title")}
        showBack={false}
        rightSlot={
          <UserHeaderRight onPress={() => handleNavigation("handleSettings")} />
        }
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
        <ScrollView
          style={globalStyles.flex1}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: 100,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...testProps("scroll_view_user_profile")}
        >
          <ProfileSection
            userInfo={user?.userInfo || undefined}
            onPress={() => handleNavigation("handleSettings")}
            qaId="button_profile_section_user"
          />

          {features.voiceAssistants && (
            <UserIntegrationSection
              title={t("user.profile.thirdPartyIntegration.title")}
              integrations={integrations}
              onIntegrationPress={(action) =>
                handleNavigation(action as RouteAction)
              }
            />
          )}
          <UserOperationsSection
            operations={userOperations}
            onOperationPress={(action) =>
              handleNavigation(action as RouteAction)
            }
          />

          <View
            {...testProps("view_user_logout")}
            style={[
              userStyles.section,
              globalStyles.shadowElevationForLightTheme,
            ]}
          >
            <LogoutButton onPress={handleLogout} qaId="button_logout_user" />
          </View>
        </ScrollView>
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
});

export { User };
