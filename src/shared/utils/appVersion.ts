/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from "expo-constants";

/**
 * App version string for display, with the short build commit id appended when
 * available, e.g. "5.4.0 (a1b2c3d)". Falls back to just the version when no
 * commit id was captured at build time.
 *
 * The commit id is surfaced by app.config.ts as `extra.commitId`; `expo.version`
 * itself stays a clean dotted version (iOS CFBundleShortVersionString must be
 * dotted-numeric), so the commit id is only ever appended for display.
 * @returns The display version, e.g. "5.4.0 (a1b2c3d)" or "5.4.0".
 */
export function getDisplayVersion(): string {
  const version = Constants.expoConfig?.version ?? "";
  const commitId =
    (Constants.expoConfig?.extra?.commitId as string | undefined)?.trim() ?? "";
  return commitId ? `${version} (${commitId})` : version;
}
