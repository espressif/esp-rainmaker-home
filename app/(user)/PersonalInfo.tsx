/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// React and React Native imports
import React, { useState, useEffect } from "react";
import { StyleSheet, ViewStyle } from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Hooks and Utils
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";

// Components
import {
  Header,
  ContentWrapper,
  ScreenWrapper,
  EditableField,
  EditModal,
} from "@/components";

// Types
import { PersonalInfoField } from "@/types/global";

/**
 * PersonalInfo Fields Configuration
 */
const personalInfoFields: PersonalInfoField[] = [
  {
    id: "nickname",
    title: "user.personalInfo.nickname",
    placeholder: "user.personalInfo.nicknamePlaceholder",
    maxLength: 30,
  },
  {
    id: "userId",
    title: "user.personalInfo.userId",
    placeholder: "user.personalInfo.userIdPlaceholder",
    maxLength: 0, // Read-only field
  },
];

/**
 * PersonalInfo Component
 *
 * Displays and manages user's personal information
 *
 * Features:
 * - View and edit username/nickname
 * - Real-time validation
 * - Error handling with toast messages
 * - Loading states for async operations
 */
const PersonalInfo: React.FC = () => {
  // Hooks
  const { t } = useTranslation();
  const { store } = useCDF();
  const toast = useToast();

  // State
  const [userName, setUserName] = useState("");
  const [nickName, setNickName] = useState("");
  const [userId, setUserId] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Effects
  useEffect(() => {
    initializeUserInfo();
  }, [store]);

  // Handlers
  const initializeUserInfo = async () => {
    const userInfo = store?.userStore?.userInfo;
    if (userInfo) {
      setUserName(userInfo.name || "");
    }

    // Get user ID from user instance - try different approaches
    try {
      const userInstance = store?.userStore?.user;
      if (userInstance) {
        // Try to get user ID from the user instance itself
        const userDetails = await userInstance.getUserInfo();
        // Check if there's an id property or use a different approach
        if (userDetails && typeof userDetails === "object") {
          // Try to access id from different possible locations
          const id =
            (userDetails as any).id ||
            (userDetails as any).userId ||
            (userDetails as any).user_id;
          if (id) {
            setUserId(id);
          }
        }
      }
    } catch (error) {
      console.error("Error getting user ID:", error);
    }
  };

  /**
   * Generic async operation handler with loading state and error handling
   */
  const handleAsyncOperation = async (
    operation: () => Promise<any>,
    successCallback: () => void,
    errorMessage: string
  ) => {
    setIsLoading(true);
    try {
      await operation();
      successCallback();
    } catch (error) {
      console.error(errorMessage, error);
      toast.showError(t("user.errors.nicknameUpdateFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Edit modal handlers
   */
  const handleEditPress = () => {
    setNickName(userName);
    setShowEditModal(true);
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
    setNickName("");
  };

  const handleConfirmEdit = () => {
    if (nickName.trim() && nickName !== userName) {
      /**
       * Update nickname
       *
       * SDK function used:
       * ESPRMUser.updateName
       */
      handleAsyncOperation(
        async () => await store?.userStore?.user?.updateName(nickName),
        () => {
          setUserName(nickName);
          setShowEditModal(false);
        },
        "Error updating nickname"
      );
    } else {
      setShowEditModal(false);
    }
  };

  // Field configuration
  const nicknameField = personalInfoFields.find(
    (field) => field.id === "nickname"
  );
  const userIdField = personalInfoFields.find((field) => field.id === "userId");

  // Guard clause
  if (!nicknameField || !userIdField) {
    return null;
  }

  // Render
  return (
    <>
      <Header label={t("user.personalInfo.title")} showBack={true} />
      <ScreenWrapper style={styles.container}>
        <ContentWrapper
          title={t(nicknameField.title)}
          style={{
            ...globalStyles.shadowElevationForLightTheme,
            backgroundColor: tokens.colors.white,
          }}
        >
          <EditableField
            value={userName}
            placeholder={t(nicknameField.placeholder)}
            onEdit={handleEditPress}
            mode="edit"
          />
        </ContentWrapper>

        <ContentWrapper
          title={t(userIdField.title)}
          style={{
            ...globalStyles.shadowElevationForLightTheme,
            backgroundColor: tokens.colors.white,
            marginTop: tokens.spacing._15,
          }}
        >
          <EditableField
            value={userId}
            placeholder={t(userIdField.placeholder)}
            onEdit={() => {}} // Read-only field - no action
            mode="copy"
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
        />
      </ScreenWrapper>
    </>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    ...globalStyles.container,
    padding: tokens.spacing._15,
    backgroundColor: tokens.colors.bg5,
  } as ViewStyle,
});

export default PersonalInfo;
