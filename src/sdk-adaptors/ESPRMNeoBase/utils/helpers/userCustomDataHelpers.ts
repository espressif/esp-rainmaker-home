/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { decodeToken, ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import { type ESPCDFUserCustomDataRequest } from "@store";

/**
 * AsyncStorage key prefix for per-user custom data (e.g. lastSelectedHomeId,
 * language override). Keeps the historical `rmng.` prefix on purpose:
 * installed users have data stored under this exact key. Changing it
 * orphans them — they lose their selected home / language / any custom pref
 * on next launch.
 */
const STORAGE_KEY_PREFIX = "rmng.cdf.v1.userCustomData";

/** Stored map shape (same as Rainmaker UserCustomDataResponse / DataEntry in input.d.ts). */
type StoredCustomDataEntry = Exclude<ESPCDFUserCustomDataRequest[string], null>;
type StoredUserCustomData = Record<string, StoredCustomDataEntry>;

/**
 * Builds the namespaced AsyncStorage key for an RMNeo user.
 * @param userId - Stable RMNeo user identifier.
 * @returns Namespaced custom-data storage key.
 */
function storageKeyForUser(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

/**
 * Parses stored custom data, returning an empty map for invalid data.
 * @param raw - Raw AsyncStorage value.
 * @returns Parsed custom-data map.
 */
function parseStoredCustomData(raw: string | null): StoredUserCustomData {
  if (raw == null || raw === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as StoredUserCustomData;
  } catch {
    return {};
  }
}

/**
 * Applies a CDF custom-data patch to the currently stored map.
 * @param current - Current custom-data map.
 * @param patch - Custom-data entries to merge or remove.
 * @returns Merged custom-data map.
 */
function mergeUserCustomData(
  current: StoredUserCustomData,
  patch: ESPCDFUserCustomDataRequest,
): StoredUserCustomData {
  const next: StoredUserCustomData = { ...current };
  for (const key of Object.keys(patch)) {
    const entry = patch[key];
    if (entry === null) {
      delete next[key];
    } else {
      next[key] = { ...next[key], ...entry };
    }
  }
  return next;
}

/**
 * Resolves a stable per-user id for namespacing local custom data in AsyncStorage.
 * @param user - Authenticated RMNeo user.
 * @returns Stable token-derived ID or user-info fallback.
 */
export async function resolveRmneoUserIdForCustomDataStorage(
  user: ESPRMNeoUser,
): Promise<string> {
  try {
    const decoded = decodeToken(await user.getIdToken());
    const id = decoded["cognito:username"] ?? decoded.sub;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  } catch {
    /* fall through */
  }
  const info = await user.getUserInfo();
  const fallback =
    (typeof info.username === "string" && info.username) ||
    (typeof info.userAttributes?.email === "string" &&
      info.userAttributes.email) ||
    "";
  return fallback;
}

/**
 * Reads locally persisted custom data for an RMNeo user.
 * @param userId - Stable RMNeo user identifier.
 * @returns Stored custom-data map.
 */
export async function getRmneoAdaptorUserCustomData(
  userId: string,
): Promise<StoredUserCustomData> {
  const raw = await AsyncStorage.getItem(storageKeyForUser(userId));
  return parseStoredCustomData(raw);
}

/**
 * Applies and persists an RMNeo user custom-data patch.
 * @param userId - Stable RMNeo user identifier.
 * @param patch - Custom-data entries to merge or remove.
 */
export async function applyRmneoAdaptorUserCustomDataPatch(
  userId: string,
  patch: ESPCDFUserCustomDataRequest,
): Promise<void> {
  const current = await getRmneoAdaptorUserCustomData(userId);
  const merged = mergeUserCustomData(current, patch);
  await AsyncStorage.setItem(
    storageKeyForUser(userId),
    JSON.stringify(merged),
  );
}
