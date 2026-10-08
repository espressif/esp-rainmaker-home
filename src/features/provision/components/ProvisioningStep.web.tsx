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
import { flattenStyle } from "@shared/utils/flattenStyle";
import { testProps } from "@shared/utils/testProps";

interface ProvisioningStepProps {
  description: string;
  /** Optional live detail under the step title (e.g. setting-up sub-status). */
  detail?: string;
  status: ProvisionStatus;
  error?: string;
}

/**
 * Web provisioning step row with flattened container styles for DOM safety.
 * @param props - Step copy, optional detail, status, and optional failure message.
 * @returns One provisioning progress row with status icon.
 */
export const ProvisioningStep: React.FC<ProvisioningStepProps> = ({
  description,
  detail,
  status,
  error,
}) => {
  /**
   * Picks the status glyph for the current step state.
   * @returns Icon or spinner for progress / success / failure / pending.
   */
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
      style={flattenStyle([
        styles.stepContainer,
        { backgroundColor: tokens.colors.bg5 },
      ])}
    >
      {getStatusIcon()}
      <View {...testProps("view_content_provision")} style={styles.stepContent}>
        <Text
          {...testProps("text_description_provision")}
          style={styles.stepDescription}
        >
          {description}
        </Text>
        {!!detail && (
          <Text {...testProps("text_detail_provision")} style={styles.stepDetail}>
            {detail}
          </Text>
        )}
        {error && status === "failed" && (
          <Text {...testProps("text_error_provision")} style={styles.stepError}>
            {error}
          </Text>
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
  stepDetail: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.lightGray,
    marginTop: tokens.spacing._5,
    fontFamily: tokens.fonts.regular,
    fontWeight: "300",
  },
  stepError: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.red,
    marginTop: tokens.spacing._5,
    marginLeft: tokens.spacing._5,
    fontFamily: tokens.fonts.regular,
  },
});
