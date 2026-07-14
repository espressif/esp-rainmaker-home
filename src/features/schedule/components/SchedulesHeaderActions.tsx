/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { TouchableOpacity, Text, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

interface SchedulesHeaderActionsProps {
  hasSchedules: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
  onRefresh: () => void;
}

/**
 * SchedulesHeaderActions Component
 *
 * Displays header actions for the schedules screen.
 * Shows the edit/done button when schedules exist; the refresh button is always visible.
 */
export const SchedulesHeaderActions = ({
  hasSchedules,
  isEditing,
  onEditToggle,
  onRefresh,
}: SchedulesHeaderActionsProps) => {
  const { t } = useTranslation();

  return (
    <View style={styles.rightSlot}>
      {hasSchedules ? (
        <TouchableOpacity
          {...testProps("button_edit_schedules")}
          onPress={onEditToggle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text {...testProps("text_edit_schedules")} style={globalStyles.schedulesEditButton}>
            {isEditing ? t("schedule.schedules.done") : t("schedule.schedules.edit")}
          </Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        {...testProps("button_refresh_schedules")}
        onPress={onRefresh}
        style={globalStyles.schedulesEditButtonContainer}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <RefreshCw size={20} color={tokens.colors.primary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  rightSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._15,
  },
});
