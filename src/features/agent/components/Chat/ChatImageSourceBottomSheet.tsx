/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Camera, ImagePlus } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

interface ChatImageSourceBottomSheetProps {
  /** Whether the source picker sheet is visible. */
  visible: boolean;
  /** Closes the sheet without selecting a source. */
  onClose: () => void;
  /** Opens the device camera to capture a new photo. */
  onTakePhoto: () => void;
  /** Opens the photo library to choose an existing image. */
  onChooseFromGallery: () => void;
}

/**
 * Bottom sheet offering camera or gallery as image attachment sources for chat.
 */
export const ChatImageSourceBottomSheet: React.FC<
  ChatImageSourceBottomSheetProps
> = ({ visible, onClose, onTakePhoto, onChooseFromGallery }) => {
  const { t } = useTranslation();

  /**
   * Stops backdrop presses from bubbling into the sheet content.
   */
  const handleContentPress = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={handleContentPress}>
          <Text style={styles.title}>{t("chat.attachImageSourceTitle")}</Text>

          <TouchableOpacity
            style={styles.optionRow}
            onPress={onTakePhoto}
            activeOpacity={0.7}
            accessibilityLabel={t("chat.takePhoto")}
          >
            <Camera size={20} color={tokens.colors.primary} />
            <Text style={styles.optionText}>{t("chat.takePhoto")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionRow}
            onPress={onChooseFromGallery}
            activeOpacity={0.7}
            accessibilityLabel={t("chat.chooseFromGallery")}
          >
            <ImagePlus size={20} color={tokens.colors.primary} />
            <Text style={styles.optionText}>{t("chat.chooseFromGallery")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityLabel={t("common.cancel")}
          >
            <Text style={styles.cancelText}>{t("common.cancel")}</Text>
          </TouchableOpacity>

          <View style={globalStyles.bottomSafeArea} />
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  sheet: {
    backgroundColor: tokens.colors.bg1,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    paddingTop: tokens.spacing._20,
    paddingHorizontal: tokens.spacing._20,
    gap: tokens.spacing._10,
  },
  title: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_secondary,
    marginBottom: tokens.spacing._5,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
    paddingVertical: tokens.spacing._15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.bg3,
  },
  optionText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: tokens.spacing._15,
    marginTop: tokens.spacing._5,
  },
  cancelText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_secondary,
  },
});
