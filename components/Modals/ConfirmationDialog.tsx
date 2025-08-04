/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// React Native Imports
import React, { ReactNode, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";

// Components
import { Button } from "tamagui";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
interface ConfirmationDialogProps {
  /** Element that triggers the dialog */
  trigger?: ReactNode;
  /** Whether the dialog is open */
  open?: boolean;
  /** Dialog title - optional, if not provided, title will be hidden */
  title?: string;
  /** Dialog description */
  description: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Callback when confirmed */
  onConfirm: () => void;
  /** Callback when cancelled */
  onCancel?: () => void;
  /** Color of confirm button */
  confirmColor?: string;
  /** Show loading spinner */
  isLoading?: boolean;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  trigger,
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  confirmColor = tokens.colors.primary,
  isLoading = false,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isVisible = open ?? internalOpen;

  const handleCancel = () => {
    setInternalOpen(false);
    onCancel?.();
  };

  const handleConfirm = () => {
    setInternalOpen(false);
    onConfirm();
  };

  return (
    <>
      {trigger && (
        <Pressable onPress={() => setInternalOpen(true)}>{trigger}</Pressable>
      )}
      <Modal
        visible={isVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={globalStyles.modalOverlay}>
          <View style={globalStyles.modalContent}>
            {title && <Text style={globalStyles.modalTitle}>{title}</Text>}
            <Text style={globalStyles.modalDescription}>{description}</Text>

            <View style={globalStyles.modalActions}>
              <Button
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancel}
              >
                <Text style={styles.buttonText}>{cancelText}</Text>
              </Button>

              <View style={{ width: 10 }} />

              <Button
                style={[styles.button, { backgroundColor: confirmColor }]}
                onPress={handleConfirm}
              >
                <Text
                  style={[styles.buttonText, { color: tokens.colors.white }]}
                >
                  {isLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={tokens.colors.white}
                    />
                  ) : (
                    confirmText
                  )}
                </Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  button: {
    flex: 1,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    textAlign: "center",
  },
  cancelButton: {
    backgroundColor: tokens.colors.bg2,
  },
});

export default ConfirmationDialog;
