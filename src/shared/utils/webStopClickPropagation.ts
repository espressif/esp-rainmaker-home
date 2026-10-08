/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";
import { PLATFORM_WEB } from "@shared/utils/constants";

/** Event shape that exposes stopPropagation (DOM / RN-web). */
type StoppableEvent = {
  stopPropagation: () => void;
};

/**
 * Stops an event from bubbling to ancestors (e.g. parent card pressables).
 * @param event - Event exposing stopPropagation
 */
export function stopEventPropagation(event: StoppableEvent): void {
  event.stopPropagation();
}

/**
 * Spread onto a View wrapping a Switch (or similar control) so web clicks do
 * not activate a parent TouchableOpacity/Pressable. Empty on native.
 */
export const webStopClickPropagationProps: {
  onClick?: (event: StoppableEvent) => void;
} =
  Platform.OS === PLATFORM_WEB
    ? { onClick: stopEventPropagation }
    : {};
