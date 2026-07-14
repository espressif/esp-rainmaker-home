/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

export interface MigrationPromptModalProps {
  visible: boolean;
  onUnderstood: () => void;
  title: string;
  message: string;
  buttonLabel: string;
}

/**
 * Modal showing migration prompt with title, message, and understood button.
 * UI only; receives copy and handler via props.
 */
export const MigrationPromptModal: React.FC<MigrationPromptModalProps> = ({
  visible,
  onUnderstood,
  title,
  message,
  buttonLabel,
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onUnderstood}
  >
    <View style={globalStyles.modalOverlay} {...testProps("view_migration_prompt_overlay")}>
      <View style={globalStyles.modalContent} {...testProps("view_migration_prompt")}>
        <Text style={globalStyles.modalTitle}>{title}</Text>
        <Text style={globalStyles.modalDescription}>{message}</Text>
        <View style={globalStyles.modalActions}>
          <Pressable
            style={globalStyles.homeMigrationUnderstoodButton}
            onPress={onUnderstood}
            {...testProps("button_migration_prompt_understood")}
          >
            <Text style={globalStyles.homeMigrationUnderstoodButtonText}>
              {buttonLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);
