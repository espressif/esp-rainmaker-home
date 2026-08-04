/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { Header, ScreenWrapper } from "@shared/components";
import {
  DeleteAccountInitialContent,
  DeleteAccountVerificationContent,
} from "@features/user/components";
import { useDeleteAccount } from "@features/user/hooks";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { getFeatures } from "@config/features.config";

/**
 * Renders the delete account UI section.
 * Exits immediately when account deletion is unavailable for the active SDK.
 */
const DeleteAccount: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { accountDeletion } = getFeatures();
  const {
    showVerification,
    code,
    isCodeValid,
    isLoading,
    countdown,
    userEmail,
    codeValidator,
    handleCodeChange,
    handleProceed,
    handleVerify,
  } = useDeleteAccount();

  useEffect(() => {
    if (!accountDeletion) {
      router.back();
    }
  }, [accountDeletion, router]);

  if (!accountDeletion) {
    return null;
  }

  return (
    <>
      <Header
        label={
          showVerification
            ? t("user.deleteAccount.verificationTitle")
            : t("user.deleteAccount.title")
        }
        showBack
        qaId="header_delete_account"
      />
      <ScreenWrapper
        style={globalStyles.screenWrapper}
        qaId="screen_wrapper_delete_account"
      >
        {showVerification ? (
          <DeleteAccountVerificationContent
            titleText={t("user.deleteAccount.verificationCodeSent")}
            subtitleText={t("user.deleteAccount.verificationCodeSubtitle", {
              email: userEmail,
            })}
            code={code}
            onCodeChange={handleCodeChange}
            codeValidator={codeValidator}
            verifyButtonLabel={t("user.deleteAccount.verifyButton")}
            resendButtonLabel={t("user.deleteAccount.resendCode")}
            resendCountdownLabel={`${t("user.deleteAccount.resendCode")} (${countdown}s)`}
            onVerify={handleVerify}
            onResend={handleProceed}
            isCodeValid={isCodeValid}
            isLoading={isLoading}
            countdown={countdown}
          />
        ) : (
          <DeleteAccountInitialContent
            noticeText={t("user.deleteAccount.notice")}
            descriptionText={t("user.deleteAccount.description")}
            buttonLabel={t("user.deleteAccount.title")}
            onProceed={handleProceed}
            isLoading={isLoading}
          />
        )}
      </ScreenWrapper>
    </>
  );
};

export { DeleteAccount };
