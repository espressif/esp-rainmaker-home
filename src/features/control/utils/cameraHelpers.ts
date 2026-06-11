/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { SNAPSHOT_SIZE_MB_THRESHOLD } from "../constants";

/**
 * Formats a byte count as a human-readable size (KB, or MB above the threshold).
 * @param bytes - Size in bytes.
 * @returns A short size string, or empty when not a finite number.
 */
export function formatSize(bytes: unknown): string {
  const n = typeof bytes === "number" ? bytes : Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= SNAPSHOT_SIZE_MB_THRESHOLD) {
    return `${(n / SNAPSHOT_SIZE_MB_THRESHOLD).toFixed(1)} MB`;
  }
  return `${Math.round(n / 1024)} KB`;
}

/**
 * Builds the toast subtitle (`<name> · <size>`) from the device response_data,
 * tolerating a bare `name` or a full `file` path and an optional `size`.
 * @param responseData - The device's `response_data` payload.
 * @returns A subtitle string, or undefined when no name is present.
 */
export function captureDetail(responseData: unknown): string | undefined {
  const rd = (responseData ?? {}) as Record<string, unknown>;
  const raw = (rd.name ?? rd.file) as string | undefined;
  if (!raw) return undefined;
  const name = raw.split("/").pop() || raw;
  const size = formatSize(rd.size);
  return size ? `${name} · ${size}` : name;
}
