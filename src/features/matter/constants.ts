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

/** Bootstrap errors for operational discovery fabric hydration (non-UI copy). */
export const MATTER_FABRIC_BOOTSTRAP_ERROR_FABRIC_ID_MISMATCH =
  "Matter fabric id mismatch during operational bootstrap";
export const MATTER_FABRIC_BOOTSTRAP_ERROR_MISSING_FABRIC_CREDENTIALS =
  "Matter fabric credentials incomplete for operational bootstrap";