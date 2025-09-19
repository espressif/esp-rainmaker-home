/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";

// Icons
import { Check, Clock, X } from "lucide-react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
type NotificationStatus = "pending" | "accepted" | "declined";

interface NotificationItemProps {
  /** Notification title */
  title: string;
  /** Notification description */
  description: string;
  /** Timestamp string */
  timestamp: string;
  /** Current status */
  status: NotificationStatus;
  /** Accept action handler */
  onAccept?: () => void;
  /** Decline action handler */
  onDecline?: () => void;
  /** General loading state */
  loading?: boolean;
  /** Accept action loading state */
  acceptLoading?: boolean;
  /** Decline action loading state */
  declineLoading?: boolean;
}

/**
 * NotificationItem
 * 
 * A component for displaying notification items with actions.
 * Features:
 * - Status indication with icons
 * - Accept/Decline actions
 * - Loading states
 * - Timestamp display
 * - Consistent styling
 */
const NotificationItem: React.FC<NotificationItemProps> = ({
  title,
  description,
  timestamp,
  status,
  onAccept,
  onDecline,
  loading,
  acceptLoading,
  declineLoading,

}) => {
  // Helpers
  const getStatusIcon = (status: NotificationStatus) => {
    switch (status) {
      case "pending":
        return <Clock size={20} color={tokens.colors.white} />;
      case "accepted":
        return <Check size={20} color={tokens.colors.white} />;
      case "declined":
        return <X size={20} color={tokens.colors.white} />;
      default:
        return <Clock size={20} color={tokens.colors.white} />;
    }
  };

  const getStatusColor = (status: NotificationStatus) => {
    switch (status) {
      case "pending":
        return tokens.colors.blue;
      case "accepted":
        return tokens.colors.green;
      case "declined":
        return tokens.colors.orange;
      default:
        return tokens.colors.blue;
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tokens.colors.white,
          ...globalStyles.shadowElevationForLightTheme,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[globalStyles.fontMedium, styles.title]}>{title}</Text>
      </View>

      <View style={[globalStyles.flex, styles.content]}>
        <View
          style={[styles.iconWrap, { backgroundColor: getStatusColor(status) }]}
        >
          {getStatusIcon(status)}
        </View>

        <View style={[globalStyles.flex1, styles.infoContent]}>
          <Text style={[globalStyles.fontRegular, styles.description]}>
            {description}
          </Text>
          <Text style={[globalStyles.fontRegular, styles.timestamp]}>
            {timestamp}
          </Text>
        </View>
      </View>

      {status === "pending" && onAccept && onDecline && (
        <View style={[globalStyles.flex, styles.buttonContainer]}>
          <Pressable
            onPress={onDecline}
            disabled={loading}
            style={[
              globalStyles.button,
              globalStyles.buttonSecondary,
              styles.actionButton,
            ]}
          >
            {declineLoading ? (
              <ActivityIndicator size="small" color={tokens.colors.primary} />
            ) : (
              <Text style={globalStyles.buttonTextSecondary}>Decline</Text>
            )}
          </Pressable>

          <Pressable
            onPress={onAccept}
            disabled={loading}
            style={[
              globalStyles.button,
              globalStyles.buttonPrimary,
              styles.actionButton,
            ]}
          >
            {acceptLoading ? (
              <ActivityIndicator size="small" color={tokens.colors.white} />
            ) : (
              <Text style={globalStyles.buttonTextPrimary}>Accept</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing._15,
    padding: tokens.spacing._15,
  },
  header: {
    paddingBottom: tokens.spacing._10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg1,
    marginBottom: tokens.spacing._15,
  },
  title: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.black,
  },
  content: {
    marginBottom: tokens.spacing._10,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: tokens.spacing._10,
  },
  infoContent: {
    flex: 1,
  },
  description: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.black,
    marginBottom: tokens.spacing._5,
  },
  timestamp: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.bg3,
    textAlign: "right",
  },
  buttonContainer: {
    gap: tokens.spacing._10,
    marginTop: tokens.spacing._10,
  },
  actionButton: {
    flex: 1,
  },
});

export default NotificationItem;
