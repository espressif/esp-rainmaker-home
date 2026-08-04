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
import { PersonalInfoLoadingSkeleton } from "@features/user/components";
import { usePersonalInfo } from "@features/user/hooks";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { personalInfoStyles } from "@features/user/theme/userStyleSheet";

const cardStyle = {
  ...globalStyles.shadowElevationForLightTheme,
  backgroundColor: tokens.colors.white,
};

/**
 * Personal Information screen.
 * Renders field-card skeletons while profile hydrates; then only available
 * fields. Nickname edit is SDK-gated (hidden on Neo).
 */
const PersonalInfo: React.FC = observer(() => {
  const { t } = useTranslation();
  const {
    canEditNickname,
    userName,
    nickName,
    setNickName,
    email,
    phone,
    userId,
    showEditModal,
    isLoading,
    isInitializing,
    handleEditPress,
    handleCancelEdit,
    handleConfirmEdit,
  } = usePersonalInfo();

  let nextCardNeedsMargin = false;

  /**
   * Returns card style with top margin after the first visible card.
   * @returns Style object for the next ContentWrapper.
   */
  const takeCardStyle = () => {
    const style = nextCardNeedsMargin
      ? { ...cardStyle, marginTop: tokens.spacing._15 }
      : cardStyle;
    nextCardNeedsMargin = true;
    return style;
  };

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
        {isInitializing ? (
          <PersonalInfoLoadingSkeleton />
        ) : (
          <>
            {canEditNickname ? (
              <ContentWrapper
                title={t("user.personalInfo.nickname")}
                style={takeCardStyle()}
                qaId="nickname"
              >
                <EditableField
                  value={userName}
                  placeholder={t("user.personalInfo.nicknamePlaceholder")}
                  onEdit={handleEditPress}
                  mode="edit"
                  qaId="edit_nickname"
                />
              </ContentWrapper>
            ) : null}

            {email ? (
              <ContentWrapper
                title={t("user.personalInfo.email")}
                style={takeCardStyle()}
                qaId="email"
              >
                <EditableField
                  value={email}
                  placeholder={t("user.personalInfo.emailPlaceholder")}
                  onEdit={() => undefined}
                  mode="copy"
                  qaId="copy_email"
                />
              </ContentWrapper>
            ) : null}

            {phone ? (
              <ContentWrapper
                title={t("user.personalInfo.phone")}
                style={takeCardStyle()}
                qaId="phone"
              >
                <EditableField
                  value={phone}
                  placeholder={t("user.personalInfo.phonePlaceholder")}
                  onEdit={() => undefined}
                  mode="copy"
                  qaId="copy_phone"
                />
              </ContentWrapper>
            ) : null}

            {userId ? (
              <ContentWrapper
                title={t("user.personalInfo.userId")}
                style={takeCardStyle()}
                qaId="user_id"
              >
                <EditableField
                  value={userId}
                  placeholder={t("user.personalInfo.userIdPlaceholder")}
                  onEdit={() => undefined}
                  mode="copy"
                  qaId="copy_userid"
                />
              </ContentWrapper>
            ) : null}

            {canEditNickname ? (
              <EditModal
                visible={showEditModal}
                title={t("user.personalInfo.nickname")}
                value={nickName}
                onValueChange={setNickName}
                onCancel={handleCancelEdit}
                onConfirm={handleConfirmEdit}
                placeholder={t("user.personalInfo.nicknamePlaceholder")}
                maxLength={30}
                isLoading={isLoading}
                qaId="nickname"
              />
            ) : null}
          </>
        )}
      </ScreenWrapper>
    </>
  );
});

export { PersonalInfo };
