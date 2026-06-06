/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { GROUP_USER_ACCESS_SUBGROUP } from "@shared/utils/constants";

/**
 * Whether the current home/group user access allows automation CRUD and MQTT-backed automation APIs.
 * RMNG subgroup-only shares do not support automations at the home scope.
 * @param accessType Normalized {@link ESPCDFGroupInterface.accessType} (undefined treated as full access for legacy data)
 * @returns `false` when access is {@link GROUP_USER_ACCESS_SUBGROUP} only
 */
export function isAutomationsSupportedForGroupUserAccess(
  accessType: string | undefined,
): boolean {
  if (!accessType) return true;
  return accessType !== GROUP_USER_ACCESS_SUBGROUP;
}
