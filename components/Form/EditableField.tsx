/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";

// Icons
import { Edit3, Copy } from "lucide-react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

import { testProps } from "../../utils/testProps";
// Types
interface EditableFieldProps {
  /** Current field value */
  value: string;
  /** Placeholder text when value is empty */
  placeholder?: string;
  /** Callback when edit button is pressed */
  onEdit: () => void;
  /** Mode of the field - 'edit' or 'copy' */
  mode?: "edit" | "copy";
  /** QA automation identifier */
  qaId?: string;
}

/**
 * EditableField
 *
 * A text field component with an edit or copy button.
 * Features:
 * - Editable text display
 * - Edit or copy button with icon
 * - Placeholder support
 */
const EditableField: React.FC<EditableFieldProps> = ({
  value,
  placeholder = "Not set",
  onEdit,
  mode = "edit",
  qaId,
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(value);
      toast.showSuccess(t("layout.shared.copiedToClipboard"));
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      toast.showError(t("layout.shared.copyFailed"));
    }
  };

  const renderIcon = () => {
    if (mode === "copy") {
      return <Copy {...(qaId ? testProps(`${qaId}_copy`) : {})} size={20} color={tokens.colors.primary} />;
    }
    return <Edit3 {...(qaId ? testProps(`${qaId}_edit`) : {})} size={20} color={tokens.colors.primary} />;
  };

  const handlePress = () => {
    if (mode === "copy") {
      handleCopy();
    } else {
      onEdit();
    }
  };

  return (
    <View {...(qaId ? testProps(`view_${qaId}`) : {})}
      style={[
        globalStyles.flex,
        globalStyles.alignCenter,
        globalStyles.justifyBetween,
        styles.container,
      ]}
    >
      <Text
        {...testProps(`text_${qaId}`)}
        style={[
          globalStyles.fontRegular,
          styles.text,
          !value && styles.placeholderText,
        ]}
        numberOfLines={1}
      >
        {value || placeholder}
      </Text>
      <Pressable {...(qaId ? testProps(`button_${qaId}`) : {})} style={styles.editButton} onPress={handlePress}>
        {renderIcon()}
      </Pressable>
    </View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    marginBottom: tokens.spacing._10,
  },
  text: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text_primary,
    flex: 1,
    marginRight: tokens.spacing._10,
  },
  placeholderText: {
    color: tokens.colors.gray,
  },
  editButton: {
    padding: tokens.spacing._5,
  },
});

export default EditableField;
