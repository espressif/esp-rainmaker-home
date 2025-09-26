/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";
import { Platform } from "react-native";
import { ScheduleProvider } from "@/context/schedules.context";

/**
 * Schedule Layout
 *
 * Provides the Schedule context to all schedule-related screens
 * and configures the navigation stack for the schedule routes.
 */
export default function ScheduleLayout() {
  return (
    <ScheduleProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          gestureDirection: "horizontal",
          animation: Platform.select({
            ios: "slide_from_right",
            android: "slide_from_right",
            default: "slide_from_right",
          }),
        }}
      >
        <Stack.Screen
          name="Schedules"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ScheduleDeviceSelection"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ScheduleDeviceParamsSelection"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="CreateSchedule"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </ScheduleProvider>
  );
}
