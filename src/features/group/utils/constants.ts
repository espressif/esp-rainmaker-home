/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Lightbulb,
  ToggleRight,
  Fan,
  Plug,
  Thermometer,
  Router,
  Grid2X2,
  type LucideIcon,
} from "lucide-react-native";

/** The tab ID representing "All Devices" (no specific room selected). */
export const ALL_DEVICES_TAB_ID = "common";

/** Placeholder device-card rows shown while Home initializes. */
export const HOME_DEVICE_SKELETON_COUNT = 4;

/** The filter key representing all device types. */
export const FILTER_ALL = "all";

/** The fallback category key for unrecognized device types. */
export const FILTER_OTHER = "other";

/** Action identifier for powering on. */
export const POWER_ACTION_ON = "on" as const;

/** Action identifier for powering off. */
export const POWER_ACTION_OFF = "off" as const;

/** Minimum time (ms) the loader stays visible after a power broadcast. */
export const LOADER_VISIBLE_DURATION_MS = 1500;

/** Home redirectOperations key that opens the add-device / Scan QR flow. */
export const HOME_REDIRECT_ADD_DEVICE = "AddDevice";

/** Unlock Home add-device if navigation never leaves the screen. */
export const HOME_ADD_DEVICE_NAV_LOCK_RESET_MS = 2500;

/** Icon size for All On / All Off power buttons. */
export const POWER_ICON_SIZE = 20;

/** Icon size for device-type filter tab pills. */
export const FILTER_ICON_SIZE = 16;

/** Maps device category keys to their Lucide icon components. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  lighting: Lightbulb,
  switch: ToggleRight,
  fan: Fan,
  socket: Plug,
  temperature: Thermometer,
  router: Router,
};

/** Fallback icon for the "other" device category. */
export const OTHER_CATEGORY_ICON = Grid2X2;
/** Revoke confirmation target: pending share request */
export const GROUP_SHARING_REVOKE_PENDING = "pending";

/** Revoke confirmation target: accepted shared user */
export const GROUP_SHARING_REVOKE_SHARED = "shared";

export type GroupSharingRevokeKind =
  | typeof GROUP_SHARING_REVOKE_PENDING
  | typeof GROUP_SHARING_REVOKE_SHARED;
