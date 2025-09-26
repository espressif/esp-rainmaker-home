/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@/theme/globalStyleSheet";
import { formatTimeToAMPM } from "@/utils/common";

import { ScheduleTimeProps } from "@/types/global";

/**
 * ScheduleTime Component
 *
 * Displays the selected time in a schedule with a button to change it
 */
const ScheduleTime = ({ minutes = 0, onTimePress }: ScheduleTimeProps) => {
  const { t } = useTranslation();

  const selectedTime = useMemo(() => {
    const date = new Date();
    date.setHours(Math.floor(minutes / 60));
    date.setMinutes(minutes % 60);
    return date;
  }, [minutes]);

  return (
    <View style={globalStyles.scheduleRow}>
      <Text style={globalStyles.scheduleSectionTitle}>{t("schedule.time.title")}</Text>
      <Pressable onPress={onTimePress} style={globalStyles.scheduleTimeButton}>
        <Text style={globalStyles.scheduleTimeText}>
          {formatTimeToAMPM(selectedTime)}
        </Text>
      </Pressable>
    </View>
  );
};

export default ScheduleTime;
