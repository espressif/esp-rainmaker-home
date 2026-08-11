/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { Check, Trash2 } from "lucide-react-native";
import { ActionButton } from "@shared/components";
import { useKeyboardVisible } from "@shared/hooks/useKeyboardVisible";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

type SceneActionButtonsProps = {
  isEditing: boolean;
  loadingSave: boolean;
  loadingDelete: boolean;
  disabled: boolean;
  onSave: () => void;
  onDelete: () => void;
  saveLabel: string;
  deleteLabel: string;
};

/**
 * SceneActionButtons Component
 *
 * Reusable component for scene action buttons (Save/Update and Delete)
 * Used in Create Scene, Edit Scene, and other scene-related screens.
 * Hidden while the keyboard is open so the footer does not ride up over inputs.
 */
export default function SceneActionButtons({
  isEditing,
  loadingSave,
  loadingDelete,
  disabled,
  onSave,
  onDelete,
  saveLabel,
  deleteLabel,
}: SceneActionButtonsProps) {
  const isKeyboardVisible = useKeyboardVisible();

  if (isKeyboardVisible) {
    return null;
  }

  return (
    <View style={[globalStyles.actionButtonContainer, styles.container]}>
      {/* SAVE ACTION */}
      <ActionButton
        qaId="button_save_scene"
        onPress={onSave}
        disabled={disabled}
        variant="primary"
      >
        {loadingSave ? (
          <ActivityIndicator size="small" color={tokens.colors.white} />
        ) : (
          <View style={styles.buttonContent}>
            <Check size={16} color={tokens.colors.white} />
            <Text
              {...testProps("text_save_scene")}
              style={[globalStyles.fontMedium, globalStyles.textWhite]}
            >
              {saveLabel}
            </Text>
          </View>
        )}
      </ActionButton>

      {/* DELETE ACTION */}
      {isEditing && (
        <ActionButton
          qaId="button_delete_scene"
          onPress={onDelete}
          disabled={disabled}
          variant="danger"
        >
          {loadingDelete ? (
            <ActivityIndicator size="small" color={tokens.colors.white} />
          ) : (
            <View style={styles.buttonContent}>
              <Trash2 size={16} color={tokens.colors.white} />
              <Text
                {...testProps("text_delete_scene")}
                style={[globalStyles.fontMedium, globalStyles.textWhite]}
              >
                {deleteLabel}
              </Text>
            </View>
          )}
        </ActionButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: "auto",
    flexDirection: "column",
    alignItems: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
});
