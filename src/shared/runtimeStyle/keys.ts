/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Image names a style may set. Kept apart from assets.ts so store.ts and resolve.ts load without React Native.

import { DEVICE_TYPE_LIST } from "@/config/devices.config";

/** Device icon keys a style may override (from `devices.config.ts`). */
export const DEVICE_ICON_NAMES: readonly string[] = Array.from(
  new Set(
    DEVICE_TYPE_LIST.flatMap((device) => [
      device.defaultIcon,
      ...Object.values(device.icon ?? {}).map((entry) => entry.icon),
    ]),
  ),
);

/** Keys that belong in the `agents` image group (not devices/illustrations). */
export const AGENT_IMAGE_KEYS: readonly string[] = ["ai-assistant", "chat-icon"];

/** Illustration names a style may override. */
export const ILLUSTRATION_NAMES = [
  "home",
  "room",
  "network",
  "wifi",
  "chat-icon",
] as const;

export type IllustrationName = (typeof ILLUSTRATION_NAMES)[number];
