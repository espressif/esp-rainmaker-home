/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";
import { AutomationProvider } from "@/context/automation.context";
import { Platform } from "react-native";

/**
 * Automation Layout
 *
 * Layout component for automation-related screens.
 * Provides navigation structure for automation functionality.
 * Wraps all automation screens with AutomationProvider for state management.
 */
export default function AutomationLayout() {
  return (
    <AutomationProvider>
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
          name="Automations"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="CreateAutomation"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="EventDeviceSelection"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="EventDeviceParamSelection"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ActionDeviceSelection"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ActionDeviceParamSelection"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </AutomationProvider>
  );
}
