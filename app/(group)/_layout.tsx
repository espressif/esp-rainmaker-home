/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";
import { Platform } from "react-native";

export default function GroupLayout() {
  return (
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
      <Stack.Screen name="Home" />
      <Stack.Screen name="Room" />
      <Stack.Screen name="Setting" />
      <Stack.Screen name="CustomizeRoomName" />
      <Stack.Screen name="CreateRoom" />
      <Stack.Screen name="CreateRoomSuccess" />
      <Stack.Screen name="HomeManagement" />
    </Stack>
  );
}
