/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import type { ESPCDFSchedule } from "@store";
import ScheduleCard from "./ScheduleCard";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

interface SchedulesListProps {
  schedules: ESPCDFSchedule[];
  refreshing: boolean;
  isEditing: boolean;
  scheduleLoadingStates: Record<string, string>;
  onRefresh: () => void;
  onScheduleAction: (schedule: ESPCDFSchedule, action: string) => void;
}

/**
 * FlatList of schedule cards with pull-to-refresh (used when the list has items).
 * Empty state is handled separately by SchedulesEmptyState (Rooms pattern).
 * @param props - Schedules, refresh/edit state, and action handlers
 * @returns Scrollable schedules list filling the screen area
 */
export const SchedulesList = ({
  schedules,
  refreshing,
  isEditing,
  scheduleLoadingStates,
  onRefresh,
  onScheduleAction,
}: SchedulesListProps) => {
  /**
   * Renders one schedule card row.
   * @param info - FlatList item payload
   * @returns Schedule card element
   */
  const renderItem = useCallback(
    ({ item: schedule }: { item: ESPCDFSchedule }) => (
      <ScheduleCard
        name={schedule.name}
        triggers={schedule.triggers}
        deviceCount={schedule.devicesCount}
        enabled={schedule.enabled || false}
        isEditing={isEditing}
        onToggle={(value) =>
          onScheduleAction(schedule, value ? "enable" : "disable")
        }
        onPress={() => onScheduleAction(schedule, "edit")}
        onDelete={() => onScheduleAction(schedule, "delete")}
        deleteLoading={scheduleLoadingStates[schedule.id] === "delete"}
        qaId="card_schedule"
        toggleLoading={
          scheduleLoadingStates[schedule.id] === "enable" ||
          scheduleLoadingStates[schedule.id] === "disable"
        }
      />
    ),
    [isEditing, onScheduleAction, scheduleLoadingStates],
  );

  /**
   * Stable key for each schedule row.
   * @param item - Schedule entity
   * @returns Unique list key
   */
  const keyExtractor = useCallback(
    (item: ESPCDFSchedule) => item.id,
    [],
  );

  return (
    <View {...testProps("view_schedules_list")} style={globalStyles.flex1}>
      <FlatList
        {...testProps("scroll_schedules")}
        data={schedules}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={globalStyles.schedulesScrollView}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 150,
        }}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[tokens.colors.primary]}
            tintColor={tokens.colors.primary}
            progressViewOffset={10}
          />
        }
      />
    </View>
  );
};
