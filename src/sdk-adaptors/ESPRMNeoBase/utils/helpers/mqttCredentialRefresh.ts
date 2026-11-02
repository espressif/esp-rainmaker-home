/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

let pendingRefresh: Promise<void> | null = null;

/**
 * Tracks an MQTT credential refresh running in the background, so node
 * subscribes can wait for the new credentials.
 * @param refresh - The refresh.
 * @param label - Log tag of the caller.
 */
export function trackMqttCredentialRefresh(
  refresh: Promise<void>,
  label: string,
): void {
  const tracked: Promise<void> = refresh
    .catch((error) => {
      console.warn(`[${label}] MQTT credential refresh failed:`, error);
    })
    .finally(() => {
      if (pendingRefresh === tracked) {
        pendingRefresh = null;
      }
    });
  pendingRefresh = tracked;
}

/** Waits for a background credential refresh, if one is running. */
export async function waitForMqttCredentialRefresh(): Promise<void> {
  await pendingRefresh?.catch(() => {});
}
