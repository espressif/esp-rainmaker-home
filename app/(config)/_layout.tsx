/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";

/**
 * Renders the config layout UI section.
 */
export default function ConfigLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "fullScreenModal",
        animation: "slide_from_bottom",
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="ConfigScan" />
    </Stack>
  );
}
