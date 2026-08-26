/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";
import { Platform } from "react-native";

/** Anchor route: keeps a back target beneath deep-link / notification entries. */
export const unstable_settings = { anchor: "Home" };

/**
 * Renders the group layout UI section.
 */
export default function GroupLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        gestureDirection: "horizontal",
        animation: Platform.select({
          ios: "slide_from_right",
          android: "slide_from_right",
          default: "slide_from_right",
        }),
      }}
    >
      <Stack.Screen name="Home" />
      <Stack.Screen name="Rooms" />
      <Stack.Screen name="Settings" />
      <Stack.Screen name="CustomizeRoomName" />
      <Stack.Screen name="CustomizeControlGroupName" />
      <Stack.Screen name="CreateRoom" />
      <Stack.Screen name="HomeManagement" />
      <Stack.Screen name="ControlGroups" />
      <Stack.Screen name="CreateControlGroup" />
      <Stack.Screen name="ControlGroupPanel" />
    </Stack>
  );
}
