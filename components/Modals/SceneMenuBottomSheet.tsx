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
import { ShieldAlert, X } from "lucide-react-native";
import { Scene } from "@espressif/rainmaker-base-cdf";

import { testProps } from "../../utils/testProps";
// Types
interface SceneMenuOption {
  id: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  destructive?: boolean;
}

interface SceneMenuBottomSheetProps {
  scene: Scene;
  /** Whether the bottom sheet is visible */
  visible: boolean;
  /** Scene name to display in header */
  sceneName: string;
  /** Menu options to display */
  options: SceneMenuOption[];
  /** Callback when bottom sheet is closed */
  onClose: () => void;
  /** Warning message to display */
  warning?: string;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * SceneMenuBottomSheet
 *
 * A bottom sheet component for displaying scene menu options.
 * Features:
 * - Slides up from bottom with animation
 * - Scene name in header
 * - Menu options with icons and loading states
 * - Destructive action styling
 * - Backdrop press to close
 */
const SceneMenuBottomSheet: React.FC<SceneMenuBottomSheetProps> = ({
  scene,
  visible,
  sceneName,
  options,
  onClose,
  warning,
  qaId,
}) => {
  const { t } = useTranslation();
  const handleBackdropPress = () => {
    onClose();
  };

  const handleContentPress = (e: any) => {
    // Prevent closing when pressing on the content
    e.stopPropagation();
  };

  const renderOption = (option: SceneMenuOption) => (
    <TouchableOpacity
      key={option.id}
      {...testProps(`button_${option.id}_scene_menu`)}
      style={[styles.option, option.destructive && styles.destructiveOption]}
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
          {...testProps(`text_${option.id}_scene_menu`)}
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

  if (!scene) return null;

  return (
    <Modal {...(qaId ? testProps(qaId) : {})}
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
            <Text {...testProps("text_scene_name_menu")} style={styles.sceneName} numberOfLines={1}>
              {sceneName}
            </Text>
            <View style={styles.deviceCountTag}>
              <Text {...testProps("text_device_count_scene_menu")} style={styles.deviceCountText}>
                {scene.devicesCount}{" "}
                {scene.devicesCount > 1
                  ? t("scene.scenes.multipleDeviceCountPostfix")
                  : t("scene.scenes.singleDeviceCountPostfix")}
              </Text>
            </View>
            <TouchableOpacity
              {...testProps("button_close_scene_menu")}
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
              <ShieldAlert
                size={tokens.fontSize.xs}
                color={tokens.colors.warn}
              />
              <Text {...testProps("text_warning_scene_menu")} style={globalStyles.warningText}>{warning}</Text>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: "80%",
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
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  sceneName: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    flex: 1,
    marginRight: 16,
  },
  closeButton: {
    padding: 4,
  },
  optionsContainer: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    gap: 5,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: tokens.colors.bg1,
    borderRadius: 12,
    marginBottom: 5,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
  destructiveOption: {
    // borderWidth: 1,
    // borderColor: tokens.colors.red,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  optionIcon: {
    marginRight: 12,
    width: 20,
    alignItems: "center",
  },
  optionLabel: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  destructiveText: {
    color: tokens.colors.red,
    fontFamily: tokens.fonts.medium,
  },
  bottomSafeArea: {
    height: 34, // Safe area for devices with home indicator
  },
  warningContainer: {
    marginHorizontal: tokens.spacing._20,
    marginBottom: 0,
  },
  deviceCountTag: {
    backgroundColor: tokens.colors.bg4,
    borderRadius: tokens.spacing._5,
    height: 18,
    paddingHorizontal: tokens.spacing._10,
    minWidth: 75,
    color: tokens.colors.text_secondary,
    fontSize: tokens.spacing._10,
    justifyContent: "center",
  },
  deviceCountText: {
    color: tokens.colors.text_secondary,
    textAlign: "center",
    fontSize: tokens.fontSize.xs,
  },
});

export default SceneMenuBottomSheet;
