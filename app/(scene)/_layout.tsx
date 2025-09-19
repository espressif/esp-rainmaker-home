/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";
import { SceneProvider } from "@/context/scenes.context";
import { Platform } from "react-native";

/**
 * Scene Layout Component
 *
 * Provides the Scene context to all scene-related screens
 * and configures the navigation stack for the scene routes.
 */
export default function SceneLayout() {
  return (
    <SceneProvider>
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
        <Stack.Screen
          name="SceneActions"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </SceneProvider>
  );
}
