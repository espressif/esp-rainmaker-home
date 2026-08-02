/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

import {
  Header,
  ContentWrapper,
  ScreenWrapper,
  EditableField,
  EditModal,
} from "@shared/components";
import { usePersonalInfo } from "@features/user/hooks";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { personalInfoStyles } from "@features/user/theme/userStyleSheet";

const PersonalInfo: React.FC = observer(() => {
  const { t } = useTranslation();
  const {
    userName,
    nickName,
    setNickName,
    userId,
    showEditModal,
    isLoading,
    nicknameField,
    userIdField,
    handleEditPress,
    handleCancelEdit,
    handleConfirmEdit,
  } = usePersonalInfo();

  if (!nicknameField || !userIdField) {
    return null;
  }

  return (
    <>
      <Header
        label={t("user.personalInfo.title")}
        showBack
        qaId="header_personal_info"
      />
      <ScreenWrapper
        style={personalInfoStyles.container}
        qaId="screen_wrapper_personal_info"
      >
        <ContentWrapper
          title={t(nicknameField.title)}
          style={{
            ...globalStyles.shadowElevationForLightTheme,
            backgroundColor: tokens.colors.white,
          }}
          qaId="nickname"
        >
          <EditableField
            value={userName}
            placeholder={t(nicknameField.placeholder)}
            onEdit={handleEditPress}
            mode="edit"
            qaId="edit_nickname"
          />
        </ContentWrapper>

        <ContentWrapper
          title={t(userIdField.title)}
          style={{
            ...globalStyles.shadowElevationForLightTheme,
            backgroundColor: tokens.colors.white,
            marginTop: tokens.spacing._15,
          }}
          qaId="user_id"
        >
          <EditableField
            value={userId}
            placeholder={t(userIdField.placeholder)}
            onEdit={() => {}}
            mode="copy"
            qaId="copy_userid"
          />
        </ContentWrapper>

        <EditModal
          visible={showEditModal}
          title={t(nicknameField.title)}
          value={nickName}
          onValueChange={setNickName}
          onCancel={handleCancelEdit}
          onConfirm={handleConfirmEdit}
          placeholder={t(nicknameField.placeholder)}
          maxLength={nicknameField.maxLength}
          isLoading={isLoading}
          qaId="nickname"
        />
      </ScreenWrapper>
    </>
  );
});

export { PersonalInfo };
