/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { AGENT_QR_SCAN_PATH_PATTERN } from "./constants";

/**
 * Extracts an agent id from a scanned QR value (URL, path, or raw id).
 * @param scannedValue - Raw barcode payload from the camera
 * @returns Agent id when recognized, otherwise null
 */
export function parseAgentIdFromQrScan(scannedValue: string): string | null {
  const trimmed = scannedValue.trim();
  if (!trimmed) {
    return null;
  }

  const pathMatch = trimmed.match(AGENT_QR_SCAN_PATH_PATTERN);
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }

  if (/^[\w-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}
