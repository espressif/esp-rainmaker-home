/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from "expo-router";

/**
 * Matter Layout Component
 * 
 * This layout component defines the navigation structure for Matter-related screens.
 * It provides a stack navigator for the Matter commissioning flow including
 * fabric selection and commissioning progress screens.
 */
export default function MatterLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen
        name="FabricSelection"
        options={{
          title: "Select Fabric",
          headerShown: false,
        }}
      />
    </Stack>
  );
}
