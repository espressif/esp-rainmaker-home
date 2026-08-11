/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { TouchableOpacity, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

interface SchedulesHeaderActionsProps {
  hasSchedules: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
}

/**
 * Schedules header actions: edit/done when schedules exist.
 * Refresh is via pull-to-refresh only (no header refresh icon).
 * @param props - Schedules presence, edit mode, and edit toggle
 * @returns Header right-slot content, or null when there are no schedules
 */
export const SchedulesHeaderActions = ({
  hasSchedules,
  isEditing,
  onEditToggle,
}: SchedulesHeaderActionsProps) => {
  const { t } = useTranslation();

  if (!hasSchedules) {
    return null;
  }

  return (
    <TouchableOpacity
      {...testProps("button_edit_schedules")}
      onPress={onEditToggle}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text
        {...testProps("text_edit_schedules")}
        style={globalStyles.schedulesEditButton}
      >
        {isEditing
          ? t("schedule.schedules.done")
          : t("schedule.schedules.edit")}
      </Text>
    </TouchableOpacity>
  );
};
