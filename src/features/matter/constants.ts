/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Commissioning UI phases driven by {@link useCommissioning}. */
export const MATTER_COMMISSIONING_PHASE_LOADING = "loading";
export const MATTER_COMMISSIONING_PHASE_NEEDS_CONVERSION = "needs_conversion";
export const MATTER_COMMISSIONING_PHASE_CONVERTING = "converting";
export const MATTER_COMMISSIONING_PHASE_PREPARING = "preparing";
export const MATTER_COMMISSIONING_PHASE_COMMISSIONING = "commissioning";
export const MATTER_COMMISSIONING_PHASE_ERROR = "error";

export type MatterCommissioningPhase =
  | typeof MATTER_COMMISSIONING_PHASE_LOADING
  | typeof MATTER_COMMISSIONING_PHASE_NEEDS_CONVERSION
  | typeof MATTER_COMMISSIONING_PHASE_CONVERTING
  | typeof MATTER_COMMISSIONING_PHASE_PREPARING
  | typeof MATTER_COMMISSIONING_PHASE_COMMISSIONING
  | typeof MATTER_COMMISSIONING_PHASE_ERROR;

/** Route param: show fabric conversion consent UI before converting. */
export const MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED =
  "fabricConversionConsentRequired";

/** Route param value when fabric conversion consent is required. */
export const MATTER_ROUTE_PARAM_VALUE_TRUE = "true";

/** Route param value to skip consent and convert automatically. */
export const MATTER_ROUTE_PARAM_VALUE_FALSE = "false";

/**
 * Route param naming the surface the commissioning onboarding payload came from.
 * Drives copy differences (e.g. the error-screen retry hint: "scan again" vs.
 * "enter the code again"). QR scans set `qr`; the manual pairing-code screen sets
 * `manual`. Absent param defaults to the QR wording for backward compatibility.
 */
export const MATTER_ROUTE_PARAM_ENTRY_METHOD = "entryMethod";

/** {@link MATTER_ROUTE_PARAM_ENTRY_METHOD} value for the QR scanner path. */
export const MATTER_ENTRY_METHOD_QR = "qr";

/** {@link MATTER_ROUTE_PARAM_ENTRY_METHOD} value for the manual pairing-code path. */
export const MATTER_ENTRY_METHOD_MANUAL = "manual";

/**
 * Valid digit counts for a Matter manual pairing code once separators are
 * stripped: 11 digits for the standard code, 21 for the long code that also
 * carries a vendor/product id (custom-flow devices). Used by
 * {@link isValidManualPairingCode} for lightweight client-side validation before
 * handing the code to the native onboarding-payload parsers.
 */
export const MATTER_MANUAL_PAIRING_CODE_SHORT_LENGTH = 11;
export const MATTER_MANUAL_PAIRING_CODE_LONG_LENGTH = 21;

/**
 * Max characters accepted by the pairing-code input field. Larger than the
 * 21-digit long code so a code pasted **with** its printed separators
 * (e.g. `3497-011-2332`) is not truncated before {@link sanitizeManualPairingCode}
 * strips them. Validation still enforces the exact digit count.
 */
export const MATTER_MANUAL_PAIRING_CODE_MAX_INPUT_LENGTH = 30;

/** Bootstrap errors for operational discovery fabric hydration (non-UI copy). */
export const MATTER_FABRIC_BOOTSTRAP_ERROR_FABRIC_ID_MISMATCH =
  "Matter fabric id mismatch during operational bootstrap";
export const MATTER_FABRIC_BOOTSTRAP_ERROR_MISSING_FABRIC_CREDENTIALS =
  "Matter fabric credentials incomplete for operational bootstrap";