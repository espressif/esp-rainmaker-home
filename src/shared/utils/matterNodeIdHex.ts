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
 * Uppercase 16-char form — matches CHIP `DIS` log lines (`E5BFC886AA167F03`).
 * @param normalizedHex - Output of {@link normalizeMatterNodeIdHex}.
 * @returns CHIP-style uppercase node id.
 */
function formatMatterNodeIdForChipLog(normalizedHex: string): string {
  return normalizedHex.toUpperCase();
}

/**
 * Describes what CHIP operational mDNS will match for a node id (compressed fabric comes
 * from controller NOC in Android Keystore, not from RainMaker `fabric_id` string).
 * @param normalizedHex - Normalized Matter node id.
 * @returns Human-readable hint for logcat correlation.
 */
function describeChipOperationalLookup(normalizedHex: string): string {
  const nodeUpper = formatMatterNodeIdForChipLog(normalizedHex);
  return (
    `CHIP nodeId=${nodeUpper}; mDNS instance=<CompressedFabric16Hex>-${nodeUpper}._matter._tcp. ` +
    `Compare logcat DIS lines: Resolving *:${nodeUpper} or Lookup *-${nodeUpper}`
  );
}

export {
  normalizeMatterNodeIdHex,
  formatMatterNodeIdForChipLog,
  describeChipOperationalLookup,
};
