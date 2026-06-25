/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Joi from "joi";
import type { ScannedConfigPayload } from "@config/runtime.config";
import type { SDKIdentifier } from "@config/sdk.config";
import {
  ESPRMNG_BASE_SDK_ID,
  ESPRMNGMatter_BASE_SDK_ID,
  SUPPORTED_SDK_IDENTIFIERS,
} from "@config/sdk.config";
import { CONFIG_FETCH_TIMEOUT_MS } from "@shared/utils/constants";
import {
  isRmngClientOutputsDoc,
  mapRmngClientOutputsToScannedPayload,
} from "./rmngClientOutputsMap";

// Validation schema (Single Responsibility: config validation)
const ESPRM_BASE_CONFIG_SCHEMA = Joi.object({
  baseUrl: Joi.string().uri({ scheme: ["https"] }),
  version: Joi.string(),
  authUrl: Joi.string().uri({ scheme: ["https"] }).optional(),
  clientId: Joi.string().min(1).optional(),
  redirectUrl: Joi.string().uri().optional(),
  authProviders: Joi.array().items(Joi.string()).optional(),
})
  .required()
  .unknown(false);

const ESPRMNG_BASE_CONFIG_SCHEMA = Joi.object({
  baseUrl: Joi.string().uri({ scheme: ["https"] }).required(),
  apiPath: Joi.string().optional(),
  userApiBase: Joi.string().uri({ scheme: ["https"] }).optional(),
  userApiBaseUrl: Joi.string().uri({ scheme: ["https"] }).optional(),
  userApiPath: Joi.string().optional(),
  identityId: Joi.string().min(1).required(),
  awsRegion: Joi.string().min(1).required(),
  userPoolId: Joi.string().min(1).required(),
  clientId: Joi.string().min(1).required(),
  iotEndpoint: Joi.string().min(1).required(),
})
  .required()
  .unknown(false);

const CONFIG_SCHEMA = Joi.object({
  version: Joi.number().valid(1).optional().default(1),
  sdk: Joi.string()
    .valid(...SUPPORTED_SDK_IDENTIFIERS)
    .required(),
  config: Joi.when("sdk", {
    is: Joi.valid(ESPRMNG_BASE_SDK_ID, ESPRMNGMatter_BASE_SDK_ID),
    then: ESPRMNG_BASE_CONFIG_SCHEMA,
    otherwise: ESPRM_BASE_CONFIG_SCHEMA,
  }),
}).unknown(false);

/**
 * Matter-capable app: scanned `rmng-base-sdk` → `rmng-matter-sdk` (mirrors using
 * rainmaker-matter-sdk when the deployment supports Matter).
 */
function normalizeScannedActiveSdk(sdk: SDKIdentifier): SDKIdentifier {
  return sdk === ESPRMNG_BASE_SDK_ID ? ESPRMNGMatter_BASE_SDK_ID : sdk;
}

/** Parses scanned value as JSON. Returns null if not valid JSON. */
function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isHttpOrHttpsUrl(trimmed: string): boolean {
  return (
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
  );
}

/** Fetches JSON from URL. Throws on error. */
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

/** Validates config payload. Returns validated payload or throws with message. */
export function validateConfig(
  payload: ScannedConfigPayload
): ScannedConfigPayload {
  const { error, value } = CONFIG_SCHEMA.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const messages = error.details.map((d) => d.message).join(", ");
    throw new Error(`Invalid config format: ${messages}`);
  }

  const validated = value as ScannedConfigPayload;
  return {
    ...validated,
    sdk: normalizeScannedActiveSdk(validated.sdk),
  };
}

/**
 * Resolves config from scanned value (JSON string or URL).
 * Returns validated ScannedConfigPayload. Throws on error.
 */
export async function resolveConfigFromScan(
  scannedValue: string
): Promise<ScannedConfigPayload> {
  const trimmed = scannedValue.trim();
  const parsed = tryParseJson(trimmed);

  if (parsed !== null) {
    if (isRmngClientOutputsDoc(parsed)) {
      return validateConfig(
        mapRmngClientOutputsToScannedPayload(parsed)
      );
    }
    return validateConfig(parsed as ScannedConfigPayload);
  }

  if (!isHttpOrHttpsUrl(trimmed)) {
    throw new Error(
      "Invalid scan: expected JSON configuration or an http(s) URL."
    );
  }

  const fetched = await fetchJsonFromUrl(trimmed);

  if (isRmngClientOutputsDoc(fetched)) {
    return validateConfig(mapRmngClientOutputsToScannedPayload(fetched));
  }

  return validateConfig(fetched as ScannedConfigPayload);
}
