/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { PROVISION_KEEP_AWAKE_TAG } from "@features/provision/constants";

/**
 * Keeps the screen awake while the calling screen is mounted, so a long
 * provisioning run isn't cut off by auto-lock pausing the app.
 *
 * Releases its fixed tag before taking it, a no-op unless an earlier release
 * failed: on Android, a release that runs after the activity is destroyed
 * throws before expo-keep-awake drops the tag, and a leftover tag makes every
 * later activation skip FLAG_KEEP_SCREEN_ON. The native queue is serial, so the
 * release lands before the take without awaiting it.
 *
 * Imported by path rather than from the hooks barrel, which the web screen also
 * uses, so expo-keep-awake stays out of the web bundle.
 */
export const useProvisionKeepAwake = (): void => {
  useEffect(() => {
    deactivateKeepAwake(PROVISION_KEEP_AWAKE_TAG).catch(() => {});
    activateKeepAwakeAsync(PROVISION_KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      // Rejects only with no Android activity attached; the next mount clears it.
      deactivateKeepAwake(PROVISION_KEEP_AWAKE_TAG).catch(() => {});
    };
  }, []);
};
