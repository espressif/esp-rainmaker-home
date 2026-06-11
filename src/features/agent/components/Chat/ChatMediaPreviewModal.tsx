/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Modal, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import ZoomableImage from "@shared/components/ZoomableImage";

interface ChatMediaPreviewModalProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

/**
 * Full-screen modal for inspecting a chat image attachment with pinch-to-zoom.
 * @param props - Visibility, image URI, and close handler.
 * @returns Modal overlay or null when no URI is set.
 */
export const ChatMediaPreviewModal: React.FC<ChatMediaPreviewModalProps> = ({
  visible,
  uri,
  onClose,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!uri) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.viewer}>
        <ZoomableImage uri={uri} />
        <Pressable
          style={[styles.closeButton, { top: insets.top + 8 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <X size={28} color="#fff" />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});
