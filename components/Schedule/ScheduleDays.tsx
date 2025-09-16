/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@/theme/globalStyleSheet";
import { SCHEDULE_DAYS } from "@/utils/constants";
import { ScheduleDaysProps } from "@/types/global";



/**
 * ScheduleDays Component
 *
 * Displays a row of day selectors for scheduling
 */
const ScheduleDays = ({ selectedDays, onDayPress }: ScheduleDaysProps) => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.scheduleRow}>
      <Text style={globalStyles.scheduleSectionTitle}>
        {t("schedule.createSchedule.repeat")}
      </Text>
      <View style={globalStyles.scheduleDaysContainer}>
        {SCHEDULE_DAYS.map((day, index) => (
          <Pressable
            key={day + index}
            style={[
              globalStyles.scheduleDayButton,
              selectedDays.includes(index) &&
                globalStyles.scheduleDayButtonSelected,
            ]}
            onPress={() => onDayPress(index)}
          >
            <Text
              style={[
                globalStyles.scheduleDayText,
                selectedDays.includes(index) &&
                  globalStyles.scheduleDayTextSelected,
              ]}
            >
              {day}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

export default ScheduleDays;
