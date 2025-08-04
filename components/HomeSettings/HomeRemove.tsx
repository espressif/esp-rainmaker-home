/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

// Components
import { DangerButton, ConfirmationDialog } from "@/components";

// Styles
import { tokens } from "@/theme/tokens";
import { HomeRemoveProps } from "@/types/global";

/**
 * HomeRemove Component
 *
 * Manages home removal and leave functionality.
 * Provides confirmation dialog and action button for both primary and secondary users.
 *
 * Features:
 * - Confirmation dialog
 * - Loading states
 * - Different actions for primary (remove) vs secondary (leave) users
 * - Error handling
 *
 * @param props - Component properties for home removal/leave functionality
 */
const HomeRemove: React.FC<HomeRemoveProps> = ({
  onRemove,
  isLoading,
  showDelete,
  setShowDelete,
  isPrimary,
}) => {
  const { t } = useTranslation();

  // Show appropriate button based on user role
  const buttonTitle = isPrimary
    ? t("group.settings.homeRemoveButton")
    : t("group.settings.leaveHomeButton");

  const dialogTitle = isPrimary
    ? t("group.settings.confirmRemoveHomeTitle")
    : t("group.settings.confirmLeaveHomeTitle");

  const dialogMessage = isPrimary
    ? t("group.settings.confirmRemoveHomeMessage")
    : t("group.settings.confirmLeaveHomeMessage");

  return (
    <>
      <DangerButton
        icon={
          <Ionicons
            name={isPrimary ? "trash-outline" : "exit-outline"}
            size={20}
            color={tokens.colors.red}
          />
        }
        title={buttonTitle}
        onPress={() => setShowDelete(true)}
      />

      <ConfirmationDialog
        open={showDelete}
        title={dialogTitle}
        description={dialogMessage}
        confirmText={
          isPrimary ? t("layout.shared.remove") : t("layout.shared.leave")
        }
        cancelText={t("layout.shared.cancel")}
        onConfirm={onRemove}
        onCancel={() => {
          setShowDelete(false);
        }}
        confirmColor={tokens.colors.red}
        isLoading={isLoading}
      />
    </>
  );
};

export default HomeRemove;
