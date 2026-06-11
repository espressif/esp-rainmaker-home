/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { formatRelativeDurationLabel } from "@features/schedule/utils/scheduleHelper";
import type { ScheduleRelativeTimeProps } from "@src/types/global";

/**
 * Displays the selected relative delay and opens the duration picker on press.
 */
const ScheduleRelativeTime = ({
  rsec,
  onTimePress,
}: ScheduleRelativeTimeProps) => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.scheduleRow}>
      <Text style={globalStyles.scheduleSectionTitle}>
        {t("schedule.time.afterDelay")}
      </Text>
      <Pressable onPress={onTimePress} style={globalStyles.scheduleTimeButton}>
        <Text style={globalStyles.scheduleTimeText}>
          {formatRelativeDurationLabel(rsec, t)}
        </Text>
      </Pressable>
    </View>
  );
};

export default ScheduleRelativeTime;
