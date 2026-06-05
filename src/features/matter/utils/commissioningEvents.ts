/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MATTER_COMMISSIONING_SOURCE_GPS,
  STATUS_SUCCESS,
} from "@shared/utils/constants";

/**
 * Normalizes native commissioning events to a single payload shape.
 *
 * iOS commonly nests data under `requestBody`, while Android usually emits
 * the fields at the top level.
 */
export function getMatterCommissioningPayload(
  event: Record<string, unknown>,
): Record<string, unknown> {
  const rb = event.requestBody;
  if (rb && typeof rb === "object" && !Array.isArray(rb)) {
    return rb as Record<string, unknown>;
  }
  return event;
}

/**
 * Detects whether a commissioning payload represents a failure state.
 *
 * A payload is treated as failed when `success` is explicitly `false`, or when
 * a non-empty `status` is present and is not `success`.
 */
export function commissioningPayloadIndicatesFailure(
  payload: Record<string, unknown>,
): boolean {
  if (payload.success === false) return true;
  const st = String(payload.status ?? "").toLowerCase();
  if (st && st !== "success") return true;
  return false;
}

/**
 * Extracts the most useful error message from a commissioning payload.
 *
 * Supports multiple key variants returned by native layers and falls back to
 * an empty string when no message is available.
 */
export function extractCommissioningErrorMessage(
  payload: Record<string, unknown>,
): string {
  const msg =
    payload.errorMessage ??
    payload.error_message ??
    payload.error ??
    payload.description ??
    "";
  return typeof msg === "string" ? msg : String(msg);
}

/**
 * Resolves the display name for a successfully commissioned device.
 *
 * Prefers `deviceName` from the normalized payload, then falls back to the
 * raw event value, and finally to the provided default.
 */
export function extractCommissioningDeviceName(
  payload: Record<string, unknown>,
  rawEvent: Record<string, unknown>,
  defaultName: string,
): string {
  const fromPayload = payload.deviceName;
  if (typeof fromPayload === "string" && fromPayload.length > 0) {
    return fromPayload;
  }

  const fromEvent = rawEvent.deviceName;
  if (typeof fromEvent === "string" && fromEvent.length > 0) {
    return fromEvent;
  }

  return defaultName;
}

/**
 * Detects failure for commissioning confirmation response events.
 *
 * Returns `true` only when a status exists and that status is not `success`.
 */
export function commissioningConfirmResponseIndicatesFailure(
  payload: Record<string, unknown>,
  rawEvent: Record<string, unknown>,
): boolean {
  const status = String(payload.status ?? rawEvent.status ?? "").toLowerCase();
  return Boolean(status && status !== STATUS_SUCCESS);
}

/**
 * Extracts a human-readable confirmation failure description.
 *
 * Reads description fields from payload/event and falls back to the localized
 * default when native data is missing or empty.
 */
export function extractCommissioningConfirmFailureDescription(
  payload: Record<string, unknown>,
  rawEvent: Record<string, unknown>,
  fallbackMessage: string,
): string {
  const description =
    (payload.description as string) ||
    (payload.errorMessage as string) ||
    (rawEvent.description as string) ||
    "";

  return description.trim().length > 0 ? description : fallbackMessage;
}

/**
 * Returns whether a `COMMISSIONING_COMPLETE` event should finish the RN commissioning UI.
 *
 * Android emits an intermediate complete from GPS (`GPS_SERVICE`) before HeadlessJS
 * confirm finishes; only the terminal event (e.g. `HEADLESS_JS`) should navigate home.
 */
export function isMatterCommissioningTerminalComplete(
  rawEvent: Record<string, unknown>,
): boolean {
  const payload = getMatterCommissioningPayload(rawEvent);
  const source = String(payload.source ?? rawEvent.source ?? "").toUpperCase();
  return source !== MATTER_COMMISSIONING_SOURCE_GPS;
}

/**
 * Resolves a final commissioning failure message for UI/toast display.
 *
 * Uses the provided message when it contains non-whitespace content; otherwise
 * falls back to a localized default.
 */
export function resolveCommissioningFailureMessage(
  message: string | undefined,
  fallbackMessage: string,
): string {
  if (message && message.trim().length > 0) {
    return message;
  }
  return fallbackMessage;
}
