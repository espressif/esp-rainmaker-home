/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import { useTranslation } from "react-i18next";
// Styles
import { tokens } from "@/theme/tokens";

// Icons
import { X } from "lucide-react-native";
import { Switch } from "tamagui";

// Types
import { MessageDisplayConfig } from "@/utils/agent";

interface MessageDisplayConfigBottomSheetProps {
  /** Whether the bottom sheet is visible */
  visible: boolean;
  /** Callback when bottom sheet is closed */
  onClose: () => void;
  /** Current config */
  config: MessageDisplayConfig;
  /** Callback when config is saved */
  onSave: (config: MessageDisplayConfig) => void;
}

/**
 * MessageDisplayConfigBottomSheet
 *
 * A bottom sheet component for configuring message display settings.
 * Features:
 * - Slides up from bottom with animation
 * - Toggle switches for each message type
 * - Save button
 * - Backdrop press to close
 */
const MessageDisplayConfigBottomSheet: React.FC<
  MessageDisplayConfigBottomSheetProps
> = ({ visible, onClose, config, onSave }) => {
  const { t } = useTranslation();
  const [localConfig, setLocalConfig] = useState<MessageDisplayConfig>(config);

  useEffect(() => {
    if (visible) {
      setLocalConfig(config);
    }
  }, [visible, config]);

  const handleBackdropPress = () => {
    onClose();
  };

  const handleContentPress = (e: any) => {
    // Prevent closing when pressing on the content
    e.stopPropagation();
  };

  const handleToggle = (key: keyof MessageDisplayConfig) => {
    setLocalConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  const renderSwitch = (
    key: keyof MessageDisplayConfig,
    labelKey: string
  ) => {
    return (
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t(labelKey)}</Text>
        <Switch
          size="$2.5"
          checked={localConfig[key]}
          onCheckedChange={() => handleToggle(key)}
        >
          <Switch.Thumb
            animation="quicker"
            style={
              localConfig[key]
                ? { backgroundColor: tokens.colors.primary }
                : { backgroundColor: tokens.colors.white }
            }
          />
        </Switch>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoidingView}
        >
          <Pressable style={styles.content} onPress={handleContentPress}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>
                {t("chat.messageDisplayConfig.title")}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={tokens.colors.text_secondary} />
              </TouchableOpacity>
            </View>

            {/* Form */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formContainer}>
                {renderSwitch(
                  "showUser",
                  "chat.messageDisplayConfig.showUser"
                )}
                {renderSwitch(
                  "showAssistant",
                  "chat.messageDisplayConfig.showAssistant"
                )}
                {renderSwitch(
                  "showThinking",
                  "chat.messageDisplayConfig.showThinking"
                )}
                {renderSwitch(
                  "showToolCallInfo",
                  "chat.messageDisplayConfig.showToolCallInfo"
                )}
                {renderSwitch(
                  "showToolResultInfo",
                  "chat.messageDisplayConfig.showToolResultInfo"
                )}
                {renderSwitch(
                  "showUsageInfo",
                  "chat.messageDisplayConfig.showUsageInfo"
                )}
                {renderSwitch(
                  "showTransactionEnd",
                  "chat.messageDisplayConfig.showTransactionEnd"
                )}
                {renderSwitch(
                  "showHandshakeAck",
                  "chat.messageDisplayConfig.showHandshakeAck"
                )}
              </View>
            </ScrollView>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSave}
                activeOpacity={0.7}
              >
                <Text style={styles.saveButtonText}>
                  {t("common.save")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Bottom safe area */}
            <View style={styles.bottomSafeArea} />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: "80%",
    minHeight: 300,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    maxHeight: 400,
  },
  scrollContent: {
    paddingTop: 10,
  },
  formContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: tokens.spacing._15,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg3,
  },
  switchLabel: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
    flex: 1,
  },
  buttonContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: tokens.spacing._10,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  button: {
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 100,
  },
  cancelButton: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: tokens.colors.bg3,
  },
  cancelButtonText: {
    color: tokens.colors.text_primary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: tokens.colors.primary,
    borderWidth: 1.5,
    borderColor: tokens.colors.primary,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
  },
  bottomSafeArea: {
    height: 34, // Safe area for devices with home indicator
  },
});

export default MessageDisplayConfigBottomSheet;

