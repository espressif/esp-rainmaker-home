/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";

// Icons
import { X } from "lucide-react-native";
import { Checkbox } from "react-native-paper";

// Components
import Input from "@shared/components/Form/Input";
import Button from "@shared/components/Form/Button";
import Typo from "@shared/components/Form/Typo";

// Utils
import { updateUserProfile } from "@features/agent/utils/apiHelper";
import { setAgentTermsAccepted } from "@features/agent/utils/storage";
import { DEFAULT_ANONYMOUS_NICKNAME } from "@features/agent/utils/constants";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { getTermsOfUseLink, getPrivacyPolicyLink } from "@shared/utils/legalLinks";
import { agentTermsBottomSheetStyles } from "@shared/theme";
import { tokens } from "@shared/theme/tokens";
import type { AgentTermsBottomSheetProps } from "@src/types/global";

/**
 * AgentTermsBottomSheet
 *
 * A bottom sheet component for accepting agent terms and setting up profile.
 * Features:
 * - Nickname input (optional)
 * - Terms and Privacy Policy checkbox (required)
 * - Continue button enabled when terms are checked
 * - Saves profile and terms acceptance
 */
const AgentTermsBottomSheet: React.FC<AgentTermsBottomSheetProps> = ({
  visible,
  onClose,
  onComplete,
  allowClose = true,
}) => {
  const { t, i18n } = useTranslation();
  const { store } = useCDF();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [nickname, setNickname] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const userInfo = useMemo(
    () => store?.userStore?.user?.userInfo,
    [store?.userStore?.user?.userInfo],
  );

  // Initialize nickname from userInfo if available
  useEffect(() => {
    if (visible) {
      if (userInfo?.name) {
        setNickname(userInfo.name);
      } else {
        setNickname("");
      }
      setConsentChecked(false);
    }
  }, [visible, userInfo]);

  /**
   * Validates nickname input
   */
  const nicknameValidator = (
    value: string,
  ): { isValid: boolean; error?: string } => {
    if (!value.trim()) {
      return { isValid: false };
    }
    if (value.trim().length < 2) {
      return {
        isValid: false,
        error: t("auth.agentTerms.validation.nameMinLength"),
      };
    }
    if (value.trim().length > 30) {
      return {
        isValid: false,
        error: t("auth.agentTerms.validation.nameMaxLength"),
      };
    }
    return { isValid: true };
  };

  /**
   * Handles nickname input change
   */
  const handleNicknameChange = (value: string, _isValid: boolean) => {
    setNickname(value);
  };

  /**
   * Opens the Terms of Use link in a web browser
   */
  const showTerms = async () => {
    try {
      await WebBrowser.openBrowserAsync(getTermsOfUseLink(i18n.language));
    } catch (error) {
      console.error("Failed to open Terms of Use:", error);
    }
  };

  /**
   * Opens the Privacy Policy link in a web browser
   */
  const showPrivacy = async () => {
    try {
      await WebBrowser.openBrowserAsync(getPrivacyPolicyLink(i18n.language));
    } catch (error) {
      console.error("Failed to open Privacy Policy:", error);
    }
  };

  /**
   * Handles continue button press - saves nickname and terms acceptance
   */
  const handleContinue = async () => {
    if (!consentChecked) {
      return;
    }

    setIsLoading(true);

    try {
      const email = userInfo?.email || "";

      // Use nickname if provided, otherwise use default nickname
      const finalNickname = nickname.trim() || DEFAULT_ANONYMOUS_NICKNAME;

      // Update user profile via API
      await updateUserProfile({
        email,
        name: finalNickname,
      });

      // Also update nickname in userStore if not default nickname
      if (
        store.userStore.user &&
        finalNickname !== DEFAULT_ANONYMOUS_NICKNAME
      ) {
        await store.userStore.user.updateName(finalNickname);
      }

      // Store terms acceptance
      const cdfUser = store.userStore.user;
      if (cdfUser) {
        await setAgentTermsAccepted(cdfUser, true);
      }

      toast.showSuccess(t("auth.agentTerms.profileSavedSuccess"));

      // Call onComplete callback
      onComplete();
    } catch (error: any) {
      console.error("Failed to save profile:", error);
      toast.showError(
        t("auth.agentTerms.profileSaveFailed"),
        error.message || t("auth.errors.pleaseTryAgain"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackdropPress = () => {
    if (allowClose) {
      onClose();
    }
  };

  const handleContentPress = (e: any) => {
    e.stopPropagation();
  };

  const canContinue = consentChecked && !isLoading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={allowClose ? onClose : undefined}
    >
      <Pressable
        style={agentTermsBottomSheetStyles.backdrop}
        onPress={handleBackdropPress}
        disabled={!allowClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
          style={agentTermsBottomSheetStyles.keyboardView}
        >
          <Pressable
            onPress={handleContentPress}
            style={[
              agentTermsBottomSheetStyles.bottomSheet,
              { paddingBottom: Math.max(insets.bottom, tokens.spacing._20) },
            ]}
          >
            {/* Handle */}
            <View style={agentTermsBottomSheetStyles.handle} />

            {/* Header */}
            <View style={agentTermsBottomSheetStyles.header}>
              <Text style={agentTermsBottomSheetStyles.title}>
                {t("auth.agentTerms.title")}
              </Text>
              {allowClose && (
                <TouchableOpacity
                  onPress={onClose}
                  style={agentTermsBottomSheetStyles.closeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={24} color={tokens.colors.text_primary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Content */}
            <View style={agentTermsBottomSheetStyles.content}>
              <Text style={agentTermsBottomSheetStyles.subtitle}>
                {t("auth.agentTerms.subtitle")}
              </Text>

              {/* Nickname Input */}
              <View style={agentTermsBottomSheetStyles.inputContainer}>
                <Input
                  icon="person"
                  placeholder={t("auth.agentTerms.placeholder")}
                  initialValue={nickname}
                  onFieldChange={handleNicknameChange}
                  validator={nicknameValidator}
                  validateOnChange={true}
                  debounceDelay={300}
                  maxLength={30}
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (canContinue) {
                      void handleContinue();
                    }
                  }}
                  qaId="nickname"
                />
              </View>

              {/* Consent Section */}
              <View style={agentTermsBottomSheetStyles.consentContainer}>
                <Checkbox.Android
                  status={consentChecked ? "checked" : "unchecked"}
                  onPress={() => setConsentChecked(!consentChecked)}
                  color={tokens.colors.primary}
                  uncheckedColor={tokens.colors.gray}
                />
                <View style={agentTermsBottomSheetStyles.consentTextContainer}>
                  <Typo style={agentTermsBottomSheetStyles.consentText}>
                    {t("auth.signup.consentText")}{" "}
                    <Typo
                      style={agentTermsBottomSheetStyles.linkText}
                      onPress={showTerms}
                    >
                      {t("layout.shared.termsOfUse")}
                    </Typo>{" "}
                    {t("auth.signup.consentAnd")}{" "}
                    <Typo
                      style={agentTermsBottomSheetStyles.linkText}
                      onPress={showPrivacy}
                    >
                      {t("layout.shared.privacyPolicy")}
                    </Typo>
                  </Typo>
                </View>
              </View>

              {/* Continue Button */}
              <Button
                label={t("common.continue")}
                onPress={handleContinue}
                disabled={!canContinue}
                isLoading={isLoading}
                style={agentTermsBottomSheetStyles.continueButton}
                qaId="button_continue"
              />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

export default AgentTermsBottomSheet;
