/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
} from "react-native";

import { useTranslation } from "react-i18next";
// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Icons
import { X } from "lucide-react-native";

// Types
import {
  AutomationMenuBottomSheetProps,
  AutomationMenuOption,
} from "@/types/global";

/**
 * AutomationMenuBottomSheet
 *
 * A bottom sheet component for displaying automation menu options.
 * Features:
 * - Slides up from bottom with animation
 * - Automation name in header
 * - Menu options with icons and loading states
 * - Destructive action styling
 * - Backdrop press to close
 */
const AutomationMenuBottomSheet: React.FC<AutomationMenuBottomSheetProps> = ({
  automation,
  visible,
  automationName,
  options,
  onClose,
  warning,
}) => {
  const { t } = useTranslation();

  const handleBackdropPress = () => {
    onClose();
  };

  const handleContentPress = (e: any) => {
    // Prevent closing when pressing on the content
    e.stopPropagation();
  };

  const renderOption = (option: AutomationMenuOption) => (
    <TouchableOpacity
      key={option.id}
      style={[styles.option]}
      onPress={() => {
        if (!option.loading) {
          option.onPress();
        }
      }}
      disabled={option.loading}
    >
      <View style={styles.optionContent}>
        <View style={styles.optionIcon}>
          {option.loading ? (
            <ActivityIndicator
              size="small"
              color={
                option.destructive ? tokens.colors.red : tokens.colors.primary
              }
            />
          ) : (
            option.icon
          )}
        </View>

        <Text
          style={[
            styles.optionLabel,
            option.destructive && styles.destructiveText,
          ]}
        >
          {option.label}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (!automation) return null;

  // Get automation status for display
  const isEnabled = automation.enabled || false;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Pressable style={styles.content} onPress={handleContentPress}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.automationName} numberOfLines={1}>
              {automationName}
            </Text>
            <View style={styles.statusTag}>
              <Text
                style={[
                  styles.statusText,
                  isEnabled ? styles.enabledText : styles.disabledText,
                ]}
              >
                {isEnabled
                  ? t("automation.automations.automationMenuBottomSheetEnabled")
                  : t(
                      "automation.automations.automationMenuBottomSheetDisabled"
                    )}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={tokens.colors.text_secondary} />
            </TouchableOpacity>
          </View>

          {warning && (
            <View
              style={[globalStyles.warningContainer, styles.warningContainer]}
            >
              <Text style={globalStyles.warningText}>{warning}</Text>
            </View>
          )}

          {/* Options */}
          <View style={styles.optionsContainer}>
            {options.map(renderOption)}
          </View>

          {/* Bottom safe area */}
          <View style={styles.bottomSafeArea} />
        </Pressable>
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
  content: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing._20,
    paddingTop: tokens.spacing._10,
    minHeight: 200,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.borderColor,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: tokens.spacing._15,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: tokens.spacing._20,
  },
  automationName: {
    flex: 1,
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginRight: tokens.spacing._10,
  },
  statusTag: {
    backgroundColor: tokens.colors.bg1,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
    marginRight: tokens.spacing._10,
  },
  statusText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    textTransform: "uppercase",
  },
  enabledText: {
    color: tokens.colors.green,
  },
  disabledText: {
    color: tokens.colors.text_secondary,
  },
  closeButton: {
    padding: tokens.spacing._5,
  },
  warningContainer: {
    marginBottom: tokens.spacing._15,
  },
  optionsContainer: {
    paddingBottom: tokens.spacing._10,
  },
  option: {
    paddingVertical: tokens.spacing._15,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderColor,
    paddingHorizontal: 16,
    // paddingVertical: 14,
    backgroundColor: tokens.colors.bg1,
    borderRadius: 12,
    marginBottom: 5,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionIcon: {
    width: 24,
    height: 24,
    marginRight: tokens.spacing._15,
    justifyContent: "center",
    alignItems: "center",
  },
  optionLabel: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
  },
  destructiveText: {
    color: tokens.colors.red,
  },
  bottomSafeArea: {
    height: 20,
  },
});

export default AutomationMenuBottomSheet;
