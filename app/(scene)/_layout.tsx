/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";
import { Platform } from "react-native";

/** Anchor route: keeps a back target beneath deep-link / notification entries. */
export const unstable_settings = { anchor: "Scenes" };

/**
 * Scene Layout Component
 *
 * Configures the navigation stack for the scene routes.
 * Note: SceneProvider is now provided at the root layout level.
 */
export default function SceneLayout() {
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
      <Stack.Screen
        name="Scenes"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="CreateScene"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
