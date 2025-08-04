/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
} from "react-native";

// UI Components
import { YStack } from "tamagui";
import Input from "./Input";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
interface InputDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Dialog title */
  title?: string;
  /** Input placeholder text */
  inputPlaceholder?: string;
  /** Initial input value */
  initialValue?: string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Submit callback */
  onSubmit: (value: string) => void;
  /** Cancel callback */
  onCancel: () => void;
  /** Loading state */
  loading?: boolean;
}

/**
 * InputDialog
 *
 * A modal dialog component for text input with confirm/cancel actions.
 * Features:
 * - Customizable title and button labels
 * - Input field with placeholder
 * - Loading state handling
 * - Confirm/cancel actions
 * - Initial value support
 */
const InputDialog: React.FC<InputDialogProps> = ({
  open,
  title = "Input",
  inputPlaceholder = "",
  initialValue = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onSubmit,
  onCancel,
  loading = false,
}) => {
  // State
  const [value, setValue] = useState(initialValue);

  // Effects
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, open]);

  return (
    <Modal
      visible={open}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onCancel}
      >
        <TouchableOpacity
          style={styles.dialogContent}
          activeOpacity={1}
          onPress={() => {}}
        >
          <YStack alignItems="center" width="100%">
            <Text style={[globalStyles.fontMedium, styles.dialogTitle]}>
              {title}
            </Text>
            <Input
              placeholder={inputPlaceholder}
              initialValue={value}
              onFieldChange={(value) => {
                setValue((prev) => value);
              }}
              border={true}
              paddingHorizontal={false}
              marginBottom={true}
            />
            <View style={styles.dialogButtonRow}>
              <TouchableOpacity
                onPress={onCancel}
                style={[styles.dialogButton, styles.cancelButton]}
              >
                <Text
                  style={[globalStyles.fontMedium, styles.cancelButtonText]}
                >
                  {cancelLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onSubmit(value)}
                disabled={!value.trim()}
                style={[
                  styles.dialogButton,
                  styles.confirmButton,
                  !value.trim() && styles.buttonDisabled,
                ]}
              >
                <Text
                  style={[globalStyles.fontMedium, styles.confirmButtonText]}
                >
                  {loading ? <ActivityIndicator /> : confirmLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </YStack>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  dialogContent: {
    width: 320,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._20,
    shadowColor: tokens.colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dialogTitle: {
    fontSize: tokens.fontSize.lg,
    color: tokens.colors.black,
    marginBottom: tokens.spacing._15,
    marginTop: tokens.spacing._5,
    textAlign: "center",
    fontFamily: tokens.fonts.medium,
  },
  dialogButtonRow: {
    flexDirection: "row",
    width: "100%",
    gap: tokens.spacing._10,
    marginTop: tokens.spacing._10,
  },
  dialogButton: {
    flex: 1,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing._10,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: tokens.colors.bg2,
  },
  confirmButton: {
    backgroundColor: tokens.colors.blue,
  },
  cancelButtonText: {
    color: tokens.colors.gray,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
  confirmButtonText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default InputDialog;
