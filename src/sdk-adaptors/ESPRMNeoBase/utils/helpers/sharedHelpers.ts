/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFAPIResponse, ESPCDFNodeUpdateEvent } from "@store";
import {
  EVENT_NODE_CONNECTED,
  EVENT_NODE_DISCONNECTED,
  EVENT_NODE_PARAMS_CHANGED,
} from "@store";
import { SUCESS } from "@shared/utils/constants";

/** RMNeo API success body after HTTP 2xx (optional message; no body `status`). */
export type RmneoSdkApiBody = {
  message?: string;
  /** Legacy body field; prefer {@link RmneoSdkApiBody.message}. */
  description?: string;
  status?: string;
};

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
        const body = rd as Record<string, unknown>;
        if (typeof body.message === "string") parts.push(body.message);
        if (typeof body.status === "string") parts.push(body.status);
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
export function mapRMNeoLoginCatchError(
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

/** RMNeo SigV4 errors attach HTTP status and JSON body on the Error instance. */
export type RmneoHttpError = Error & {
  status?: number;
  responseData?: Record<string, unknown>;
};

export type NormalizedRmneoShareError = RmneoHttpError & {
  description: string;
  errorCode?: string;
};

/**
 * Re-throw with fields the app expects (`description`, optional `errorCode`) while preserving `status` / `responseData`.
 */
export function throwNormalizedRmneoError(
  error: unknown,
  fallbackMessage = "Request failed",
  /**
   * When set, used verbatim as the surfaced `description`, overriding the raw
   * cloud body message (e.g. a localized "remove devices first" for a 409).
   */
  overrideDescription?: string
): never {
  const e = error as RmneoHttpError;
  const rd = e.responseData;
  const apiBodyMessage = typeof rd?.message === "string" ? rd.message : undefined;
  const apiBodyStatus = typeof rd?.status === "string" ? rd.status : undefined;
  const rawCode = rd?.error_code ?? rd?.errorCode;
  const errorCode =
    rawCode !== undefined && rawCode !== null ? String(rawCode) : undefined;

  const fromHttpMessage =
    typeof e.message === "string"
      ? e.message.replace(/^HTTP error!\s*status:\s*\d+\s*-\s*/i, "").trim()
      : "";

  const description =
    overrideDescription ||
    apiBodyMessage ||
    apiBodyStatus ||
    (fromHttpMessage || e.message || fallbackMessage);

  const out = new Error(description) as NormalizedRmneoShareError;
  out.description = description;
  if (errorCode) out.errorCode = errorCode;
  if (typeof e.status === "number") out.status = e.status;
  if (rd && typeof rd === "object") out.responseData = rd;
  throw out;
}

export function throwNormalizedRmneoShareError(
  error: unknown,
  fallbackMessage = "Share request failed"
): never {
  throwNormalizedRmneoError(error, fallbackMessage);
}

/**
 * Maps a resolved RMNeo SDK API body (HTTP already succeeded) to the CDF API response contract.
 * @param res - Optional SDK response body (`message` only on success).
 * @param fallbackDescription - Used when the body has no `message` / legacy `description`.
 * @returns CDF shape with `status: "success"` for the app layer.
 */
export function normalizeRmneoSdkResponseToCdf(
  res?: RmneoSdkApiBody | null,
  fallbackDescription = "",
): ESPCDFAPIResponse {
  const description =
    (typeof res?.message === "string" && res.message) ||
    (typeof res?.description === "string" && res.description) ||
    fallbackDescription;

  return {
    status: SUCESS,
    description,
  };
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

/**
 * Applies shadow `state.reported.online` to the CDF store immediately.
 * Must not be gated by ncfg shadow coalescing — waiters would otherwise drop
 * CONNECTED/DISCONNECTED while matter_local is removed after a Wi-Fi change.
 */
export function emitShadowConnectivityEvents(
  nodeId: string,
  shadow: unknown,
  listen: (ev: ESPCDFNodeUpdateEvent) => void,
): void {
  for (const ev of mapShadowDocumentToNodeUpdateEvents(nodeId, shadow)) {
    if (
      ev.event_type === EVENT_NODE_CONNECTED ||
      ev.event_type === EVENT_NODE_DISCONNECTED
    ) {
      listen(ev);
    }
  }
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
 * Validates signup password for RMNeo. Throws `{ description }` so the app layer can show it in a toast.
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
