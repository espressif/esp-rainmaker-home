/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Joi from "joi";
import type { ScannedConfigPayload } from "@config/runtime.config";
import {
  ESPRMNeo_BASE_SDK_ID,
  normalizeSdkIdentifier,
  SUPPORTED_SDK_IDENTIFIERS,
} from "@config/sdk.config";
import { CONFIG_FETCH_TIMEOUT_MS } from "@shared/utils/constants";
import {
  CONFIG_SCAN_URL_SCHEME_HTTP,
  CONFIG_SCAN_URL_SCHEME_HTTPS,
} from "@features/config/constants";
import {
  isRmneoClientOutputsDoc,
  mapRmneoClientOutputsToScannedPayload,
} from "./rmneoClientOutputsMap";

// Validation schema (Single Responsibility: config validation)
const ESPRM_BASE_CONFIG_SCHEMA = Joi.object({
  baseUrl: Joi.string().uri({ scheme: ["https"] }),
  claimUrl: Joi.string().uri({ scheme: ["https"] }).optional(),
  version: Joi.string(),
  authUrl: Joi.string().uri({ scheme: ["https"] }).optional(),
  clientId: Joi.string().min(1).optional(),
  redirectUrl: Joi.string().uri().optional(),
  authProviders: Joi.array().items(Joi.string()).optional(),
  dashboardUrl: Joi.string().uri({ scheme: ["https"] }).optional(),
})
  .required()
  .unknown(false);

const ESPRMNEO_BASE_CONFIG_SCHEMA = Joi.object({
  baseUrl: Joi.string().uri({ scheme: ["https"] }).required(),
  userApiBase: Joi.string().uri({ scheme: ["https"] }).required(),
  awsRegion: Joi.string().min(1).required(),
  iotEndpoint: Joi.string().min(1).required(),
  dashboardUrl: Joi.string().uri({ scheme: ["https"] }).optional(),
})
  .required()
  .unknown(false);

const CONFIG_SCHEMA = Joi.object({
  version: Joi.number().valid(1).optional().default(1),
  sdk: Joi.string()
    .valid(...SUPPORTED_SDK_IDENTIFIERS)
    .required(),
  config: Joi.when("sdk", {
    is: ESPRMNeo_BASE_SDK_ID,
    then: ESPRMNEO_BASE_CONFIG_SCHEMA,
    otherwise: ESPRM_BASE_CONFIG_SCHEMA,
  }),
}).unknown(false);

/**
 * Trims a value when it is a string; otherwise returns "".
 *
 * @param value - Unknown field from scanned config JSON
 * @returns Trimmed string, or empty when not a string
 */
function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Joins an origin URL with an optional path without a double slash.
 *
 * @param origin - Base origin (may have a trailing slash)
 * @param path - Optional path segment
 * @returns Origin alone when path is empty; otherwise origin + path
 */
function joinOriginAndPath(origin: string, path: string): string {
  if (!origin) {
    return "";
  }
  if (!path) {
    return origin;
  }
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Resolves RMNeo device API `baseUrl` from `baseUrl` + optional `apiPath`.
 *
 * @param config - Raw RMNeo config fields
 * @returns Full device API base URL
 */
function resolveNeoBaseUrl(config: Record<string, unknown>): string {
  return joinOriginAndPath(
    readTrimmedString(config.baseUrl),
    readTrimmedString(config.apiPath)
  );
}

/**
 * Resolves RMNeo `userApiBase`: prefers a full `userApiBase`, else
 * `userApiBaseUrl` + optional `userApiPath`.
 *
 * @param config - Raw RMNeo config fields
 * @returns Full user/auth API base URL
 */
function resolveNeoUserApiBase(config: Record<string, unknown>): string {
  const existing = readTrimmedString(config.userApiBase);
  if (existing) {
    return existing;
  }

  return joinOriginAndPath(
    readTrimmedString(config.userApiBaseUrl),
    readTrimmedString(config.userApiPath)
  );
}

/**
 * Normalizes a scanned RMNeo config object to the two-URL shape used by
 * {@link ESPRMNeoRuntimeConfig} (joins origin + path fields when present).
 *
 * @param config - Raw config from QR / fetch (may still use apiPath / userApiBaseUrl)
 * @returns Config with full `baseUrl` and `userApiBase` only
 */
function normalizeScannedNeoConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  return {
    baseUrl: resolveNeoBaseUrl(config),
    userApiBase: resolveNeoUserApiBase(config),
    awsRegion: config.awsRegion,
    iotEndpoint: config.iotEndpoint,
    // Whitelisted explicitly: anything not named here is dropped before Joi.
    dashboardUrl: config.dashboardUrl,
  };
}

/**
 * Prepares a raw scanned payload for Joi (SDK id normalization + RMNeo URL shape).
 *
 * @param payload - Parsed scan / fetch JSON
 * @returns Payload ready for {@link validateConfig}
 */
function preprocessScannedPayload(
  payload: ScannedConfigPayload
): ScannedConfigPayload {
  const rawSdk = String(payload.sdk ?? "");
  const sdk = normalizeSdkIdentifier(rawSdk) ?? rawSdk;
  const withCanonicalSdk =
    sdk !== rawSdk ? { ...payload, sdk } : payload;

  if (
    sdk !== ESPRMNeo_BASE_SDK_ID ||
    !withCanonicalSdk.config ||
    typeof withCanonicalSdk.config !== "object"
  ) {
    return withCanonicalSdk as ScannedConfigPayload;
  }
  return {
    ...withCanonicalSdk,
    sdk: ESPRMNeo_BASE_SDK_ID,
    config: normalizeScannedNeoConfig(
      withCanonicalSdk.config as unknown as Record<string, unknown>
    ) as ScannedConfigPayload["config"],
  };
}

/** Parses scanned value as JSON. Returns null if not valid JSON. */
function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/**
 * @param trimmed - Trimmed scan string
 * @returns Whether the string looks like an http(s) URL
 */
function isHttpOrHttpsUrl(trimmed: string): boolean {
  return (
    trimmed.startsWith(CONFIG_SCAN_URL_SCHEME_HTTP) ||
    trimmed.startsWith(CONFIG_SCAN_URL_SCHEME_HTTPS)
  );
}

/**
 * Fetches JSON from URL.
 *
 * @param url - Remote config URL
 * @returns Parsed JSON body
 */
async function fetchJsonFromUrl(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.trim(), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    return (await res.json()) as unknown;
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Config fetch timeout (${CONFIG_FETCH_TIMEOUT_MS / 1000}s)`
      );
    }
    throw e;
  }
}

/**
 * Validates config payload. Returns validated payload or throws with message.
 *
 * @param payload - Candidate scanned config
 * @returns Validated {@link ScannedConfigPayload}
 */
export function validateConfig(
  payload: ScannedConfigPayload
): ScannedConfigPayload {
  const prepared = preprocessScannedPayload(payload);
  const { error, value } = CONFIG_SCHEMA.validate(prepared, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const messages = error.details.map((d) => d.message).join(", ");
    throw new Error(`Invalid config format: ${messages}`);
  }

  return value as ScannedConfigPayload;
}

/**
 * Maps client-outputs JSON to a scanned payload, or null.
 *
 * @param value - Parsed scan / fetch JSON
 * @returns Mapped payload, or null when not a client-outputs document
 */
function tryMapClientOutputsDoc(value: unknown): ScannedConfigPayload | null {
  if (isRmneoClientOutputsDoc(value)) {
    return mapRmneoClientOutputsToScannedPayload(value);
  }
  return null;
}

/**
 * Resolves config from scanned value (JSON string, client-outputs JSON, or URL).
 * Client-outputs (`rmng-base`) map to `rainmaker-neo-base-sdk`.
 *
 * @param scannedValue - QR payload or pasted string
 * @returns Validated {@link ScannedConfigPayload}
 */
export async function resolveConfigFromScan(
  scannedValue: string
): Promise<ScannedConfigPayload> {
  const trimmed = scannedValue.trim();
  const parsed = tryParseJson(trimmed);

  if (parsed !== null) {
    const fromOutputs = tryMapClientOutputsDoc(parsed);
    if (fromOutputs) {
      return validateConfig(fromOutputs);
    }
    return validateConfig(parsed as ScannedConfigPayload);
  }

  if (!isHttpOrHttpsUrl(trimmed)) {
    throw new Error(
      "Invalid scan: expected JSON configuration or an http(s) URL."
    );
  }

  const fetched = await fetchJsonFromUrl(trimmed);
  const fromFetchedOutputs = tryMapClientOutputsDoc(fetched);
  if (fromFetchedOutputs) {
    return validateConfig(fromFetchedOutputs);
  }

  return validateConfig(fetched as ScannedConfigPayload);
}
