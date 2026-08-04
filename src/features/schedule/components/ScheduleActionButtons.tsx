/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, Trash2 } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ActionButton } from "@shared/components";
import { useKeyboardVisible } from "@shared/hooks/useKeyboardVisible";
import { testProps } from "@shared/utils/testProps";

interface ScheduleActionButtonsProps {
  isEditing: boolean;
  loading: {
    save: boolean;
    delete: boolean;
  };
  disableActionButton: boolean;
  onSave: () => void;
  onDelete: () => void;
}

/**
 * ScheduleActionButtons Component
 *
 * Displays save and delete action buttons for schedule creation/editing.
 * Hidden while the keyboard is open so the footer does not ride up over inputs.
 */
export const ScheduleActionButtons = ({
  isEditing,
  loading,
  disableActionButton,
  onSave,
  onDelete,
}: ScheduleActionButtonsProps) => {
  const { t } = useTranslation();
  const isKeyboardVisible = useKeyboardVisible();

  if (isKeyboardVisible) {
    return null;
  }

  return (
    <View
      style={[
        globalStyles.actionButtonContainer,
        globalStyles.scheduleActionButtonsContainer,
      ]}
    >
      {/* SAVE ACTION */}
      <ActionButton
        qaId="button_save_schedule"
        onPress={onSave}
        disabled={disableActionButton}
        variant="primary"
      >
        {loading.save ? (
          <ActivityIndicator size="small" color={tokens.colors.white} />
        ) : (
          <View style={globalStyles.scheduleActionButtonContent}>
            <Check size={16} color={tokens.colors.white} />
            <Text
              {...testProps("text_save_schedule")}
              style={[globalStyles.fontMedium, globalStyles.textWhite]}
            >
              {isEditing ? t("layout.shared.update") : t("layout.shared.save")}
            </Text>
          </View>
        )}
      </ActionButton>

      {/* DELETE ACTION */}
      {isEditing && (
        <ActionButton
          qaId="button_delete_schedule"
          onPress={onDelete}
          disabled={disableActionButton}
          variant="danger"
        >
          {loading.delete ? (
            <ActivityIndicator size="small" color={tokens.colors.white} />
          ) : (
            <View style={globalStyles.scheduleActionButtonContent}>
              <Trash2 size={16} color={tokens.colors.white} />
              <Text style={[globalStyles.fontMedium, globalStyles.textWhite]}>
                {t("layout.shared.delete")}
              </Text>
            </View>
          )}
        </ActionButton>
      )}
    </View>
  );
};
