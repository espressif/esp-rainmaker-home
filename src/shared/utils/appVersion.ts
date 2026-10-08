/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from "expo-constants";

/**
 * App version string for display, with the build number appended to the
 * marketing version and the short commit id in a separate parenthesized
 * suffix, e.g. "6.0.0 (57) (a1b2c3d)". Falls back gracefully when either is
 * missing.
 *
 * `expo.version` itself stays a clean dotted version (iOS
 * CFBundleShortVersionString must be dotted-numeric), so build number and
 * commit id are only ever appended for display.
 * @returns The display version, e.g. "6.0.0 (57) (a1b2c3d)" or "6.0.0".
 */
export function getDisplayVersion(): string {
  const version = Constants.expoConfig?.version ?? "";
  const versionCode = Constants.expoConfig?.extra?.versionCode as
    | number
    | undefined;
  const commitId =
    (Constants.expoConfig?.extra?.commitId as string | undefined)?.trim() ?? "";

  const withCode = versionCode !== undefined ? `${version} (${versionCode})` : version;
  return commitId ? `${withCode} (${commitId})` : withCode;
}
