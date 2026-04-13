/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNodeUpdateEvent } from "@store";
import {
  EVENT_NODE_CONNECTED,
  EVENT_NODE_DISCONNECTED,
  EVENT_NODE_PARAMS_CHANGED,
} from "@store";

const NOT_AUTHORIZED_MARKER = "NotAuthorizedException:";

function loginErrorSearchText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === "string") parts.push(o.message);
    const orig = o.originalError;
    if (orig && typeof orig === "object") {
      const rd = (orig as Record<string, unknown>).responseData;
      if (rd && typeof rd === "object") {
        const st = (rd as Record<string, unknown>).status;
        if (typeof st === "string") parts.push(st);
      }
    }
    if (parts.length > 0) return parts.join("");
  }
  try {
    return String(error);
  } catch {
    return "";
  }
}

/**
 * If the text contains `NotAuthorizedException:`, returns `{ description }` with only
 * the trimmed substring after that marker (e.g. `Incorrect username or password.`).
 * Leading `authentication failed: ...` and trailing `]` from console formatting are dropped.
 */
export function mapRMNGLoginCatchError(
  error: unknown
): { description: string } | undefined {
  const blob = loginErrorSearchText(error);
  const idx = blob.indexOf(NOT_AUTHORIZED_MARKER);
  if (idx === -1) return undefined;

  let description = blob.slice(idx + NOT_AUTHORIZED_MARKER.length).trim();
  if (description.endsWith("]")) {
    description = description.slice(0, -1).trim();
  }
  return { description };
}

/** RMNG SigV4 errors attach HTTP status and JSON body on the Error instance. */
export type RmngHttpError = Error & {
  status?: number;
  responseData?: Record<string, unknown>;
};

export type NormalizedRmngShareError = RmngHttpError & {
  description: string;
  errorCode?: string;
};

/**
 * Re-throw with fields the app expects (`description`, optional `errorCode`) while preserving `status` / `responseData`.
 */
export function throwNormalizedRmngShareError(
  error: unknown,
  fallbackMessage = "Share request failed"
): never {
  const e = error as RmngHttpError;
  const rd = e.responseData;
  const apiBodyStatus = typeof rd?.status === "string" ? rd.status : undefined;
  const apiBodyMessage = typeof rd?.message === "string" ? rd.message : undefined;
  const rawCode = rd?.error_code ?? rd?.errorCode;
  const errorCode =
    rawCode !== undefined && rawCode !== null ? String(rawCode) : undefined;

  const fromHttpMessage =
    typeof e.message === "string"
      ? e.message.replace(/^HTTP error!\s*status:\s*\d+\s*-\s*/i, "").trim()
      : "";

  const description =
    apiBodyStatus ||
    apiBodyMessage ||
    (fromHttpMessage || e.message || fallbackMessage);

  const out = new Error(description) as NormalizedRmngShareError;
  out.description = description;
  if (errorCode) out.errorCode = errorCode;
  if (typeof e.status === "number") out.status = e.status;
  if (rd && typeof rd === "object") out.responseData = rd;
  throw out;
}

/** IoT shadow timestamps are often Unix seconds; `handleNodeConnected` expects ms. */
function shadowTimeToMs(ts: number | undefined): number {
  if (ts == null || !Number.isFinite(ts)) {
    return Date.now();
  }
  return ts > 1e12 ? ts : ts * 1000;
}

/**
 * Maps an MQTT device shadow document to CDF node-update events consumed by
 * `subscriptionStore.nodeUpdates.listen` → `handleNodeUpdateEvent`.
 *
 * Emits at most one connectivity event (`state.reported.online`) and one params event when present.
 */
export function mapShadowDocumentToNodeUpdateEvents(
  nodeId: string,
  shadow: unknown
): ESPCDFNodeUpdateEvent[] {
  const out: ESPCDFNodeUpdateEvent[] = [];
  if (!shadow || typeof shadow !== "object") {
    return out;
  }

  const doc = shadow as Record<string, any>;
  const reported = doc.state?.reported;
  const metaReported = doc.metadata?.reported;

  if (typeof reported?.online === "boolean") {
    const rawTs = metaReported?.online?.timestamp ?? doc.timestamp;
    out.push({
      event_type: reported.online
        ? EVENT_NODE_CONNECTED
        : EVENT_NODE_DISCONNECTED,
      node_id: nodeId,
      payload: null,
      timestamp: shadowTimeToMs(rawTs),
    });
  }

  const params = reported?.params;
  if (
    params &&
    typeof params === "object" &&
    !Array.isArray(params) &&
    Object.keys(params).length > 0
  ) {
    const rawTs =
      typeof doc.timestamp === "number"
        ? doc.timestamp
        : metaReported?.online?.timestamp;
    out.push({
      event_type: EVENT_NODE_PARAMS_CHANGED,
      node_id: nodeId,
      payload: params,
      timestamp: shadowTimeToMs(rawTs),
    });
  }

  return out;
}


/** Thrown shape consumed by auth hooks (e.g. useSignup) via `err.description`. */
export type SignupPasswordPolicyError = {
  description: string;
};

const MIN_LENGTH = 8;

const POLICY_MESSAGE =
  "Password must be at least 8 characters and include one uppercase letter and one special character.";

function hasUppercaseLetter(password: string): boolean {
  return /[A-Z]/.test(password);
}

/** Non-alphanumeric ASCII (symbols, space, etc.). */
function hasSpecialCharacter(password: string): boolean {
  return /[^A-Za-z0-9]/.test(password);
}

/**
 * Validates signup password for RMNG. Throws `{ description }` so the app layer can show it in a toast.
 */
export function assertSignupPasswordPolicy(password: string): void {
  if (
    password.length < MIN_LENGTH ||
    !hasUppercaseLetter(password) ||
    !hasSpecialCharacter(password)
  ) {
    const err: SignupPasswordPolicyError = { description: POLICY_MESSAGE };
    throw err;
  }
}
