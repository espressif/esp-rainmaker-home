/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFMatterFabricDetails } from "@store";

/**
 * Normalizes SDK fabric details into CDF fabric details.
 *
 * Both clouds return snake_case on the wire while the SDK types declare
 * camelCase (and omit `matter_user_id`), so every field is read under both
 * spellings. Shared by the RainMaker and Neo Matter adaptors.
 * @param raw - Fabric details as the SDK exposes them, or undefined before `getFabricDetails`
 * @returns Normalized credentials, or undefined when nothing is populated
 */
export function normalizeMatterFabricDetails(
  raw: Record<string, unknown> | undefined,
): ESPCDFMatterFabricDetails | undefined {
  if (!raw) {
    return undefined;
  }
  const pick = (camel: string, snake: string): unknown => raw[camel] ?? raw[snake];
  const result = {
    rootCa: pick("rootCa", "root_ca"),
    matterUserId: pick("matterUserId", "matter_user_id"),
    ipk: raw.ipk,
    groupCatIdOperate: pick("groupCatIdOperate", "group_cat_id_operate"),
    groupCatIdAdmin: pick("groupCatIdAdmin", "group_cat_id_admin"),
    userCatId: pick("userCatId", "user_cat_id"),
  };

  const hasAny = Object.values(result).some(
    (v) => v !== undefined && v !== null && String(v).length > 0,
  );
  return hasAny ? (result as ESPCDFMatterFabricDetails) : undefined;
}
