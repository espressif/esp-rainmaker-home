/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScheduleCardProps } from "@/types/global";

// Utils
import { getScheduleTimeText } from "@/utils/common";

// React Native Imports
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useMemo } from "react";

// Components
import { Switch } from "tamagui";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Constants
import { SCHEDULE_DAYS } from "@/utils/constants";

// Icons
import { Clock, Trash2 } from "lucide-react-native";

// Hooks
import { useTranslation } from "react-i18next";

// Utils
import { testProps } from "@/utils/testProps";

/**
 * ScheduleCard Component
 *
 * A card component that displays schedule information including:
 * - Schedule name
 * - Time
 * - Device count
 * - Repeat days
 * - Enable/disable toggle
 * - Edit/delete options when in edit mode
 */
const ScheduleCard = ({
  name,
  triggers,
  deviceCount,
  enabled,
  isEditing = false,
  onPress,
  onDelete,
  onToggle,
  deleteLoading = false,
  toggleLoading = false,
  qaId,
}: ScheduleCardProps & { qaId?: string }) => {
  const { t } = useTranslation();

  const { timeText } = useMemo(() => {
    if (!triggers || triggers.length === 0) {
      return { timeText: "" };
    }

    // For now, we'll just use the first trigger
    // TODO: Handle multiple triggers if needed
    const trigger = triggers[0];

    return {
      timeText: getScheduleTimeText(trigger),
    };
  }, [triggers]);

  return (
    <TouchableOpacity
      {...(qaId ? testProps(qaId) : {})}
      style={[globalStyles.scheduleCard]}
      onPress={onPress}
      disabled={isEditing}
    >
      <View style={globalStyles.scheduleHeader}>
        <Text style={globalStyles.scheduleTitle} numberOfLines={1}>
          {name}
        </Text>
        <View style={globalStyles.scheduleTimeContainer}>
          <Clock size={14} color={tokens.colors.text_secondary} />
          <Text style={globalStyles.scheduleTime}>{timeText}</Text>
        </View>
        {!isEditing ? (
          <Switch
            {...testProps("switch_enable_schedule")}
            size="$2.5"
            borderColor={tokens.colors.bg1}
            borderWidth={0}
            checked={enabled}
            onCheckedChange={onToggle}
            style={[globalStyles.switch]}
          >
            <Switch.Thumb
              animation="quicker"
              style={
                enabled
                  ? globalStyles.switchThumbActive
                  : globalStyles.switchThumb
              }
              disabled={toggleLoading}
            />
          </Switch>
        ) : (
          <TouchableOpacity
            {...testProps("button_delete_schedule")}
            style={[styles.actionButton]}
            onPress={onDelete}
            disabled={deleteLoading}
          >
            {deleteLoading ? (
              <ActivityIndicator size="small" color={tokens.colors.red} />
            ) : (
              <Trash2 size={18} color={tokens.colors.red} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={globalStyles.scheduleRepeatContainer}>
        <Text style={globalStyles.secondaryText}>{t("schedule.createSchedule.repeat")}</Text>
        {!triggers?.[0]?.d || triggers[0]?.d === 0 ? (
          <View style={globalStyles.scheduleDaysContainer}>
            <View
              style={[
                globalStyles.scheduleDayBox,
                globalStyles.scheduleDayBoxActive,
                styles.onceBox,
              ]}
            >
              <Text
                style={[
                  globalStyles.scheduleDayText,
                  globalStyles.scheduleDayTextActive,
                ]}
              >
                {t("schedule.time.once")}
              </Text>
            </View>
          </View>
        ) : (
          <View style={globalStyles.scheduleDaysContainer}>
            {SCHEDULE_DAYS.map((day, index) => {
              const isActive = Boolean(
                triggers[0]?.d && triggers[0].d & (1 << index)
              );
              return (
                <View
                  key={day + index}
                  style={[
                    globalStyles.scheduleDayBox,
                    isActive && globalStyles.scheduleDayBoxActive,
                  ]}
                >
                  <Text
                    style={[
                      globalStyles.scheduleDayText,
                      isActive && globalStyles.scheduleDayTextActive,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.deviceCountTag}>
        <Text style={styles.deviceCountText}>
            {deviceCount > 1
              ? t("schedule.devices.other", { count: deviceCount })
              : t("schedule.devices.one", { count: deviceCount })}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  onceBox: {
    width: "auto",
    minWidth: 45,
    paddingHorizontal: tokens.spacing._5,
  },
  deviceCountTag: {
    backgroundColor: tokens.colors.bg4,
    borderRadius: 12,
    width: "auto",
    minWidth: 75,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    borderTopLeftRadius: 8,
    borderBottomRightRadius: tokens.radius.md,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    alignSelf: "flex-start",
    marginTop: tokens.spacing._5,
    position: "absolute",
    bottom: 0,
    right: 0,
  },
  deviceCountText: {
    color: tokens.colors.text_secondary,
    fontSize: 10,
    fontWeight: "400",
  },
  actionButton: {
    width: 46,
    height: 25,
    borderRadius: tokens.radius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButton: {
    backgroundColor: tokens.colors.red,
  },
});

export default ScheduleCard;
