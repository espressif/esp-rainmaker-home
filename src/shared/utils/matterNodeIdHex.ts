/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Log prefix for cross-layer Matter id verification (Metro + native logcat). */
export const MATTER_DISCOVERY_VERIFY_LOG = "[MatterDiscoveryVerify]";

/**
 * Normalizes a cloud / CDF Matter node id to 16-char lowercase hex for maps and native sync.
 * @param raw - Matter node id from API or CDF (may include `0x` prefix or mixed case).
 * @returns Normalized id or `undefined` when not valid hex.
 */
function normalizeMatterNodeIdHex(
  raw: string | undefined,
): string | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const hex = raw.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{1,16}$/.test(hex)) {
    return undefined;
  }
  return hex.toLowerCase().padStart(16, "0").slice(-16);
}

/**
 * Whether a raw id is already a full Matter operational node id: exactly 16 hex
 * digits, the form the cloud keys pure Matter nodes by.
 * @param value - Candidate id
 * @returns True for a 16-digit hex string (either case)
 */
function isMatterOperationalNodeIdHex(value: string | undefined): boolean {
  return typeof value === "string" && /^[0-9a-fA-F]{16}$/.test(value);
}

export { isMatterOperationalNodeIdHex, normalizeMatterNodeIdHex };
