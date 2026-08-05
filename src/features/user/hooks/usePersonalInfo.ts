/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";

// Hooks
import { useCDF } from "@shared/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";

// Types
import { PersonalInfoField } from "@src/types/global";

export const PERSONAL_INFO_FIELDS: PersonalInfoField[] = [
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
    maxLength: 0,
  },
];

/**
 * Manages personal info state and related actions.
 */
export const usePersonalInfo = () => {
  const { t } = useTranslation();
  const { store } = useCDF();
  const toast = useToast();

  const [userName, setUserName] = useState("");
  const [nickName, setNickName] = useState("");
  const [userId, setUserId] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const user = store?.userStore.user;

  useEffect(() => {
    const initializeUserInfo = async () => {
      if (user && user.userInfo) {
        setUserName(user.userInfo.name || "");
      }
      try {
        if (user) {
          const userDetails = await user.getUserInfo();
          if (userDetails?.id) {
            setUserId(userDetails.id);
          }
        }
      } catch (error) {
        console.error("Error getting user ID:", error);
      }
    };
    initializeUserInfo();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [store]);

  const handleAsyncOperation = async (
    operation: () => Promise<void>,
    successCallback: () => void
  ) => {
    setIsLoading(true);
    try {
      await operation();
      successCallback();
    } catch (error) {
      console.error("Error updating nickname", error);
      toast.showError(t("user.errors.nicknameUpdateFailed"));
    } finally {
      setIsLoading(false);
    }
  };

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
      handleAsyncOperation(
        async () => {
          await user?.updateName(nickName);
        },
        () => {
          setUserName(nickName);
          setShowEditModal(false);
        }
      );
    } else {
      setShowEditModal(false);
    }
  };

  const nicknameField = PERSONAL_INFO_FIELDS.find((f) => f.id === "nickname");
  const userIdField = PERSONAL_INFO_FIELDS.find((f) => f.id === "userId");

  return {
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
  };
};
