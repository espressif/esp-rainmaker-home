/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Check, X, Circle } from "lucide-react-native";
import type { ProvisionStatus } from "@src/types/global";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

interface ProvisioningStepProps {
  description: string;
  status: ProvisionStatus;
  error?: string;
}

/**
 * Renders a single provisioning step with status indicator
 */
export const ProvisioningStep: React.FC<ProvisioningStepProps> = ({
  description,
  status,
  error,
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case "progress":
        return (
          <View {...testProps("activity_indicator_in_progress_provision")}>
            <ActivityIndicator size="small" color={tokens.colors.primary} />
          </View>
        );
      case "succeed":
        return (
          <View {...testProps("icon_succeed_provision")}>
            <Check size={24} color={tokens.colors.green} />
          </View>
        );
      case "failed":
        return (
          <View {...testProps("icon_failed_provision")}>
            <X size={24} color={tokens.colors.red} />
          </View>
        );
      default:
        return (
          <View {...testProps("icon_pending_provision")}>
            <Circle size={24} color={tokens.colors.gray} />
          </View>
        );
    }
  };

  return (
    <View
      {...testProps("view_status_provision")}
      style={[styles.stepContainer, { backgroundColor: tokens.colors.bg5 }]}
    >
      {getStatusIcon()}
      <View {...testProps("view_content_provision")} style={styles.stepContent}>
        <Text {...testProps("text_description_provision")} style={styles.stepDescription}>{description}</Text>
        {error && status === "failed" && (
          <Text {...testProps("text_error_provision")} style={styles.stepError}>{error}</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  stepContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: tokens.colors.white,
    marginBottom: tokens.spacing._5,
    borderRadius: tokens.radius.md,
    gap: tokens.spacing._10,
  },
  stepContent: {
    flex: 1,
  },
  stepDescription: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.gray,
  },
  stepError: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.red,
    marginTop: tokens.spacing._5,
    marginLeft: tokens.spacing._5,
    fontFamily: tokens.fonts.regular,
  },
});
