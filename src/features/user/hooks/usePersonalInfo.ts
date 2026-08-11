/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";

// Config
import { getResolvedActiveSdk, isRmneoStackSdkId } from "@config/sdk.config";

// Hooks
import { useCDF } from "@shared/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";

/**
 * Manages personal info state and related actions.
 * Neo: read-only email / phone / user id (only when present). Other SDKs: editable nickname + user id.
 * @returns Profile values, init/edit loading flags, and nickname edit handlers.
 */
export const usePersonalInfo = () => {
  const { t } = useTranslation();
  const { store } = useCDF();
  const toast = useToast();

  const canEditNickname = !isRmneoStackSdkId(getResolvedActiveSdk());

  const [userName, setUserName] = useState("");
  const [nickName, setNickName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const user = store?.userStore.user;

  useEffect(() => {
    /**
     * Seeds local state from store `userInfo`, then refreshes via `getUserInfo()`.
     */
    const initializeUserInfo = async () => {
      setIsInitializing(true);
      if (user?.userInfo) {
        if (canEditNickname) {
          setUserName(user.userInfo.name || user.userInfo.nickname || "");
        }
        setEmail(user.userInfo.email?.trim() || "");
        setPhone(user.userInfo.phone?.trim() || "");
        setUserId(user.userInfo.id?.trim() || "");
      }

      try {
        if (!user) {
          return;
        }
        const userDetails = await user.getUserInfo();
        if (canEditNickname) {
          setUserName(userDetails.name || userDetails.nickname || "");
        }
        setEmail(userDetails.email?.trim() || "");
        setPhone(userDetails.phone?.trim() || "");
        setUserId(userDetails.id?.trim() || "");
      } catch (error) {
        console.error("Error getting user info:", error);
      } finally {
        setIsInitializing(false);
      }
    };
    void initializeUserInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [store, canEditNickname]);

  /**
   * Runs an async profile mutation with loading and error toast handling.
   * @param operation - Async work to perform.
   * @param successCallback - Invoked after a successful operation.
   */
  const handleAsyncOperation = async (
    operation: () => Promise<void>,
    successCallback: () => void,
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

  /**
   * Opens the nickname edit modal with the current display name.
   */
  const handleEditPress = () => {
    setNickName(userName);
    setShowEditModal(true);
  };

  /**
   * Closes the nickname edit modal without saving.
   */
  const handleCancelEdit = () => {
    setShowEditModal(false);
    setNickName("");
  };

  /**
   * Persists nickname via `updateName` when the value changed; otherwise closes the modal.
   */
  const handleConfirmEdit = () => {
    if (nickName.trim() && nickName !== userName) {
      handleAsyncOperation(
        async () => {
          await user?.updateName(nickName);
        },
        () => {
          setUserName(nickName);
          setShowEditModal(false);
        },
      );
    } else {
      setShowEditModal(false);
    }
  };

  return {
    canEditNickname,
    userName,
    nickName,
    setNickName,
    email,
    phone,
    userId,
    showEditModal,
    isLoading,
    /** Initial getUserInfo / hydrate — drives PersonalInfoLoadingSkeleton. */
    isInitializing,
    handleEditPress,
    handleCancelEdit,
    handleConfirmEdit,
  };
};
