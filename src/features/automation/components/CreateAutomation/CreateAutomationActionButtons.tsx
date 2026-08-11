/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Check, Trash2 } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ActionButton } from "@shared/components";
import { useKeyboardVisible } from "@shared/hooks/useKeyboardVisible";
import { testProps } from "@shared/utils/testProps";
import { createAutomationStyles as styles } from "../../theme/createAutomationStyles";

export interface CreateAutomationActionButtonsProps {
  isEditing: boolean;
  loadingSave: boolean;
  loadingDelete: boolean;
  disableSave: boolean;
  disableDelete: boolean;
  createButtonLabel: string;
  updateButtonLabel: string;
  deleteButtonLabel: string;
  onCreate: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

/**
 * Renders the create automation action buttons UI section.
 * Hidden while the keyboard is open so the footer does not ride up over inputs.
 */
export const CreateAutomationActionButtons: React.FC<
  CreateAutomationActionButtonsProps
> = ({
  isEditing,
  loadingSave,
  loadingDelete,
  disableSave,
  disableDelete,
  createButtonLabel,
  updateButtonLabel,
  deleteButtonLabel,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const isKeyboardVisible = useKeyboardVisible();

  if (isKeyboardVisible) {
    return null;
  }

  return (
    <View style={[globalStyles.actionButtonContainer, styles.buttonContainer]}>
      {!isEditing && (
        <ActionButton
          qaId="button_create_automation"
          onPress={onCreate}
          disabled={disableSave}
          variant="primary"
        >
          {loadingSave ? (
            <ActivityIndicator size="small" color={tokens.colors.white} />
          ) : (
            <View style={styles.buttonContent}>
              <Check size={16} color={tokens.colors.white} />
              <Text
                {...testProps("text_create_automation")}
                style={[globalStyles.fontMedium, globalStyles.textWhite]}
              >
                {createButtonLabel}
              </Text>
            </View>
          )}
        </ActionButton>
      )}

      {isEditing && (
        <ActionButton
          qaId="button_update_automation"
          onPress={onUpdate}
          disabled={disableSave}
          variant="primary"
        >
          {loadingSave ? (
            <ActivityIndicator size="small" color={tokens.colors.white} />
          ) : (
            <View style={styles.buttonContent}>
              <Check size={16} color={tokens.colors.white} />
              <Text
                {...testProps("text_update_automation")}
                style={[globalStyles.fontMedium, globalStyles.textWhite]}
              >
                {updateButtonLabel}
              </Text>
            </View>
          )}
        </ActionButton>
      )}

      {isEditing && (
        <ActionButton
          qaId="button_delete_automation"
          onPress={onDelete}
          disabled={disableDelete}
          variant="danger"
        >
          {loadingDelete ? (
            <ActivityIndicator size="small" color={tokens.colors.white} />
          ) : (
            <View style={styles.buttonContent}>
              <Trash2 size={16} color={tokens.colors.white} />
              <Text
                {...testProps("text_delete_automation")}
                style={[globalStyles.fontMedium, globalStyles.textWhite]}
              >
                {deleteButtonLabel}
              </Text>
            </View>
          )}
        </ActionButton>
      )}
    </View>
  );
};
