/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";
import { Platform } from "react-native";


export default function AgentLayout() {
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
      <Stack.Screen name="Chat" />
      <Stack.Screen name="ChatSettings" />
      <Stack.Screen name="Settings" />
      <Stack.Screen name="Configure" />
      <Stack.Screen name="ViewConversation" />
    </Stack>
  );
}

