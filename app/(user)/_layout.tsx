/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";
import { Platform } from "react-native";

/** Anchor route: keeps a back target beneath deep-link / notification entries. */
export const unstable_settings = { anchor: "User" };

/**
 * User Layout
 *
 * Gives the User tab its own stack, matching the other footer tabs. Without it
 * these screens pushed straight onto the root stack, stranding them underneath
 * the next tab on a tab switch.
 */
export default function UserLayout() {
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
      <Stack.Screen name="User" />
      <Stack.Screen name="PersonalInfo" />
      <Stack.Screen name="AccountSecurity" />
      <Stack.Screen name="Settings" />
      <Stack.Screen name="Language" />
      <Stack.Screen name="NotificationCenter" />
      <Stack.Screen name="DeleteAccount" />
      <Stack.Screen name="AboutUs" />
      <Stack.Screen name="AlexaGuide" />
      <Stack.Screen name="GoogleAssistantGuide" />
    </Stack>
  );
}
