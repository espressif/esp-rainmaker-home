/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  BackHandler,
} from "react-native";
import { UserCircle } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

interface OAuthLoadingOverlayProps {
  onClose: () => void;
  message: string;
  progressMessage?: string;
}

/**
 * Renders the o auth loading overlay UI section.
 */
export function OAuthLoadingOverlay({
  onClose,
  message,
  progressMessage,
}: OAuthLoadingOverlayProps) {
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  return (
    <View style={[globalStyles.emptyStateContainer, styles.container]}>
      <View style={styles.content}>
        <View style={globalStyles.emptyStateIconContainer}>
          <UserCircle size={40} color={tokens.colors.primary} />
        </View>
        <Text style={[globalStyles.emptyStateTitle, styles.message]}>
          {message}
        </Text>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>

      {progressMessage && (
        <View style={styles.progressContainer}>
          <View style={styles.progressRow}>
            <ActivityIndicator
              size="small"
              color={tokens.colors.text_secondary}
              style={styles.progressSpinner}
            />
            <Text style={styles.progressText}>{progressMessage}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.bg5,
    flex: 1,
  },
  closeButtonContainer: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 10,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: tokens.colors.bg5,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  message: {
    marginBottom: tokens.spacing._10,
  },
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.colors.bg5,
    padding: tokens.spacing._15,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderColor,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  progressSpinner: {
    marginRight: tokens.spacing._10,
  },
  progressText: {
    fontSize: 15,
    color: tokens.colors.text_secondary,
    fontStyle: "italic",
  },
});
