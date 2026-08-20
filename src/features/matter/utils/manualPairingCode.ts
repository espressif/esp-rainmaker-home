/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MATTER_MANUAL_PAIRING_CODE_LONG_LENGTH,
  MATTER_MANUAL_PAIRING_CODE_SHORT_LENGTH,
} from "@features/matter/constants";

/**
 * Strips everything except digits from a user-entered Matter manual pairing code.
 *
 * Users routinely type the code the way it is printed on the device — grouped
 * with spaces or hyphens (e.g. `3497-011-2332`). The native onboarding-payload
 * parsers (`OnboardingPayloadParser.parseManualPairingCode` on Android,
 * `MTRSetupPayload(onboardingPayload:)` on iOS) expect the bare digit string, so
 * we normalise before handing the value off.
 * @param input - Raw text from the pairing-code input field.
 * @returns The input with all non-digit characters removed.
 * @example
 * ```ts
 * sanitizeManualPairingCode("3497-011-2332"); // "34970112332"
 * ```
 */
export function sanitizeManualPairingCode(input: string): string {
  return input.replace(/\D/g, "");
}

// Verhoeff dihedral-group (D5) tables — Matter's "Verhoeff10" check digit, used
// as the final digit of a manual pairing code. Kept in sync with the E2E
// generator at test/utils/matter_pairing.py.
const VERHOEFF_D: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV: readonly number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** Computes the Verhoeff10 check digit for a string of decimal digits. */
function verhoeffCheckDigit(digits: string): string {
  let checksum = 0;
  const reversed = digits.split("").reverse();
  for (let position = 0; position < reversed.length; position += 1) {
    const value = Number(reversed[position]);
    checksum = VERHOEFF_D[checksum][VERHOEFF_P[(position + 1) % 8][value]];
  }
  return String(VERHOEFF_INV[checksum]);
}

/**
 * Whether a sanitised code has one of the two lengths Matter defines for a
 * manual pairing code: 11 digits for the standard form, 21 for the long form
 * that also carries a vendor/product id (custom-flow devices).
 *
 * Split out from {@link isValidManualPairingCode} so the entry screen can tell
 * "still typing" apart from "right length, wrong digits" and say which it is,
 * rather than showing one generic failure for both.
 * @param code - A sanitised (digits-only) pairing code from
 * {@link sanitizeManualPairingCode}.
 * @returns `true` when the digit count is 11 or 21.
 * @example
 * ```ts
 * hasManualPairingCodeLength("34970112332"); // true  (11 digits)
 * hasManualPairingCodeLength("3497011233");  // false (10 digits)
 * ```
 */
export function hasManualPairingCodeLength(code: string): boolean {
  return (
    code.length === MATTER_MANUAL_PAIRING_CODE_SHORT_LENGTH ||
    code.length === MATTER_MANUAL_PAIRING_CODE_LONG_LENGTH
  );
}

/**
 * Client-side validation that a sanitised pairing code is well-formed before it
 * is sent into the commissioning pipeline.
 *
 * Checks both the length (11 or 21 digits) **and** the trailing Verhoeff10 check
 * digit. The check-digit test matters because a single mistyped digit otherwise
 * passes a length-only test, reaches native, and — on iOS — fails
 * `MTRSetupPayload` parsing silently, leaving the commissioning screen stuck.
 * Rejecting it here surfaces immediate "invalid code" feedback instead.
 * @param code - A sanitised (digits-only) pairing code from
 * {@link sanitizeManualPairingCode}.
 * @returns `true` when the code has a valid length and check digit.
 * @example
 * ```ts
 * isValidManualPairingCode("34970112332"); // true  (valid check digit)
 * isValidManualPairingCode("34970112331"); // false (bad check digit)
 * isValidManualPairingCode("123");         // false (bad length)
 * ```
 */
export function isValidManualPairingCode(code: string): boolean {
  if (!hasManualPairingCodeLength(code)) {
    return false;
  }
  return verhoeffCheckDigit(code.slice(0, -1)) === code.slice(-1);
}
