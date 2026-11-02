/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
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
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

import { testProps } from "@shared/utils/testProps";
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
  /**
   * Called when the dialog is closed without pressing a button (Android
   * back). Defaults to `onCancel`; set it when the cancel button does more
   * than close the dialog.
   */
  onDismiss?: () => void;
  /** Color of confirm button */
  confirmColor?: string;
  /** Show loading spinner */
  isLoading?: boolean;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * Renders the confirmation dialog UI section.
 */
const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  trigger,
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  onDismiss,
  confirmColor = tokens.colors.primary,
  isLoading = false,
  qaId,
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

  const handleDismiss = () => {
    if (!onDismiss) {
      handleCancel();
      return;
    }
    setInternalOpen(false);
    onDismiss();
  };

  return (
    <>
      {trigger && (
        <Pressable onPress={() => setInternalOpen(true)}>{trigger}</Pressable>
      )}
      <Modal
        {...(qaId ? testProps(`dialog_${qaId}`) : {})}
        visible={isVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleDismiss}
      >
        <View style={globalStyles.modalOverlay}>
          <View style={globalStyles.modalContent}>
            {title && (
              <Text
                {...testProps(`text_title_${qaId}`)}
                style={globalStyles.modalTitle}
              >
                {title}
              </Text>
            )}
            <Text
              {...testProps(`text_description_${qaId}`)}
              style={globalStyles.modalDescription}
            >
              {description}
            </Text>

            <View style={globalStyles.modalActions}>
              <Button
                {...testProps("button_cancel_dialog")}
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancel}
              >
                <Text
                  {...testProps("text_label_cancel")}
                  style={styles.buttonText}
                >
                  {cancelText}
                </Text>
              </Button>

              <View style={{ width: 10 }} />

              <Button
                {...testProps("button_confirm_dialog")}
                style={[styles.button, { backgroundColor: confirmColor }]}
                onPress={handleConfirm}
              >
                <Text
                  {...testProps("text_label_confirm")}
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
