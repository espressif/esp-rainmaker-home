/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFSnapshotConfig, ESPCDFStorageAdapterInterface } from "@store";

/**
 * Disk snapshot of the home tree, kept by the CDF: written whenever the tree
 * changes, restored on cold start so Home paints before the network answers.
 *
 * This is the only cache-related setting the app owns. In-session behaviour
 * needs no configuration: the CDF serves the store once synced and refetches
 * only on a push event, an own mutation or a forced sync.
 */
export const SNAPSHOT_CONFIG = {
  enabled: true,
  /** Snapshots older than this are ignored on restore. */
  maxAgeMs: 86_400_000,
  /** How long a restored control waits for the first live sync before failing. */
  liveTimeoutMs: 15_000,
  /** Quiet time after a store change before the snapshot is written. */
  persistDelayMs: 1_500,
} as const;

/** The CDF-facing snapshot config, or `undefined` when the snapshot is switched off. */
export function snapshotConfigFor(
  storage: ESPCDFStorageAdapterInterface,
): ESPCDFSnapshotConfig | undefined {
  if (!SNAPSHOT_CONFIG.enabled) return undefined;
  const { maxAgeMs, liveTimeoutMs, persistDelayMs } = SNAPSHOT_CONFIG;
  return { storage, maxAgeMs, liveTimeoutMs, persistDelayMs };
}
