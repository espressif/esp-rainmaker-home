/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Modal, Text, StyleSheet } from "react-native";

// Components
import Button from "../Form/Button";
import Input from "../Form/Input";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

import { testProps } from "../../utils/testProps";
// Types
interface EditModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Modal title text */
  title: string;
  /** Current input value */
  value: string;
  /** Callback when input value changes */
  onValueChange: (value: string) => void;
  /** Callback when cancel button is pressed */
  onCancel: () => void;
  /** Callback when confirm button is pressed */
  onConfirm: () => void;
  /** Input placeholder text */
  placeholder?: string;
  /** Maximum input length */
  maxLength?: number;
  /** Show loading spinner */
  isLoading?: boolean;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * EditModal
 *
 * A modal dialog for editing text values with loading state support.
 * Features:
 * - Text input with validation
 * - Loading state with ActivityIndicator
 * - Cancel and confirm actions
 * - Character limit support
 */
const EditModal: React.FC<EditModalProps> = ({
  visible,
  title,
  value,
  onValueChange,
  onCancel,
  onConfirm,
  placeholder,
  maxLength,
  isLoading = false,
  qaId,
}) => {
  // Render helpers
  const renderConfirmButton = () => (
    <Button
      qaId="button_confirm"
      label="Confirm"
      onPress={onConfirm}
      disabled={isLoading}
      isLoading={isLoading}
      style={styles.confirmButton}
      wrapperStyle={{ width: "48%" }}
    />
  );

  const renderCancelButton = () => (
    <Button
      qaId="button_cancel"
      label="Cancel"
      onPress={onCancel}
      disabled={isLoading}
      style={styles.cancelButton}
      textStyle={styles.cancelButtonText}
      wrapperStyle={{ width: "48%" }}
    />
  );

  return (
    <Modal {...(qaId ? testProps(`edit_modal_${qaId}`) : {})}  visible={visible} transparent animationType="fade">
      <View style={[globalStyles.modalOverlay]} {...(qaId ? testProps(`view_${qaId}`) : {})}>
        <View style={[globalStyles.modalContent]}>
          <Text {...(qaId ? testProps(`text_modal_title_${qaId}`) : {})} style={[globalStyles.modalTitle]}>{title}</Text>

          <Input
            qaId={qaId}
            initialValue={value}
            onFieldChange={(value) => onValueChange(value)}
            placeholder={placeholder}
            maxLength={maxLength}
            editable={!isLoading}
            border={true}
            style={styles.input}
          />

          <View style={[globalStyles.modalActions]}>
            {renderCancelButton()}
            {renderConfirmButton()}
          </View>
        </View>
      </View>
    </Modal>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.bg1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: 0,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
    backgroundColor: tokens.colors.white,
    width: "100%",
  },
  cancelButton: {
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.bg2,
  },
  cancelButtonText: {
    color: tokens.colors.text_primary,
  },
  confirmButton: {
    borderRadius: tokens.radius.md,
  },
});

export default EditModal;
