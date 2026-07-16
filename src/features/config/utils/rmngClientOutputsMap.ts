/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGRuntimeConfig, ScannedConfigPayload } from "@config/runtime.config";
import { ESPRMNG_BASE_SDK_ID } from "@config/sdk.config";

/** Matches default in rmng-base-sdk ESPSigV4APIManager when pathname is empty. */
const DEFAULT_STAGE_PATH = "/prod";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Splits an execute-api style URL into origin (RMNG_BASE_URL) and path (RMNG_API_PATH),
 * matching .env.global.example / .env.cn.example / app.config `rmngSdk` semantics.
 */
export function splitExecuteApiUrl(apiUrl: string): {
  baseUrl: string;
  apiPath: string;
} {
  const u = new URL(apiUrl.trim());
  const rawPath = u.pathname.replace(/\/$/, "");
  const apiPath =
    rawPath === "" || rawPath === "/" ? DEFAULT_STAGE_PATH : rawPath;
  return { baseUrl: u.origin, apiPath };
}

function normalizeIotEndpoint(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("https://")) {
    return t.slice("https://".length).replace(/\/$/, "");
  }
  if (t.startsWith("http://")) {
    return t.slice("http://".length).replace(/\/$/, "");
  }
  return t.replace(/\/$/, "");
}

function pickMainApiUrl(rmng: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(rmng, "ApiGatewayUrl") ??
    readNonEmptyString(rmng, "RMBaseApiEndpointFAE735B6")
  );
}

function pickUserApiUrl(userBase: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(userBase, "EspUserApiUrl") ??
    readNonEmptyString(userBase, "CreateCommonBaseResourcesEspUserApiEndpointB000E4CB")
  );
}

/** True when JSON has top-level `rmng-base` object (RainMaker client outputs file). */
export function isRmngClientOutputsDoc(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  const rb = value["rmng-base"];
  return isPlainObject(rb);
}

/**
 * Maps rmng-client-outputs.json (see public S3 bundle) into scanned RMNG runtime config.
 * Field mapping aligns with .env.global.example / .env.cn.example: RMNG_BASE_URL, RMNG_API_PATH, RMNG_USER_*,
 * RMNG_IDENTITY_ID, RMNG_AWS_REGION, RMNG_USER_POOL_ID, RMNG_CLIENT_ID, RMNG_IOT_ENDPOINT.
 */
export function mapRmngClientOutputsToScannedPayload(
  value: unknown
): ScannedConfigPayload {
  if (!isRmngClientOutputsDoc(value)) {
    throw new Error("Not a RMNG client outputs document (missing rmng-base).");
  }

  const doc = value as Record<string, unknown>;
  const rmng = doc["rmng-base"] as Record<string, unknown>;
  const userBaseRaw = doc["espuser-base"];

  if (!isPlainObject(userBaseRaw)) {
    throw new Error(
      "RMNG client outputs: missing or invalid espuser-base (required for user API URLs)."
    );
  }

  const mainApi = pickMainApiUrl(rmng);
  if (!mainApi) {
    throw new Error(
      "RMNG client outputs: rmng-base must include ApiGatewayUrl or RMBaseApiEndpointFAE735B6."
    );
  }

  const userApi = pickUserApiUrl(userBaseRaw);
  if (!userApi) {
    throw new Error(
      "RMNG client outputs: espuser-base must include EspUserApiUrl or CreateCommonBaseResourcesEspUserApiEndpointB000E4CB."
    );
  }

  const identityId = readNonEmptyString(rmng, "IdentityPoolId");
  const awsRegion = readNonEmptyString(rmng, "StackRegion");
  const userPoolId = readNonEmptyString(rmng, "UserPoolId");
  const clientId = readNonEmptyString(rmng, "UserPoolClientId");
  const iotRaw = readNonEmptyString(rmng, "IoTEndpointUrl");

  if (!identityId || !awsRegion || !userPoolId || !clientId || !iotRaw) {
    throw new Error(
      "RMNG client outputs: rmng-base missing one of IdentityPoolId, StackRegion, UserPoolId, UserPoolClientId, IoTEndpointUrl."
    );
  }

  const { baseUrl, apiPath } = splitExecuteApiUrl(mainApi);
  const { baseUrl: userApiBaseUrl, apiPath: userApiPath } =
    splitExecuteApiUrl(userApi);

  const config: ESPRMNGRuntimeConfig = {
    baseUrl,
    apiPath,
    userApiBaseUrl,
    userApiPath,
    identityId,
    awsRegion,
    userPoolId,
    clientId,
    iotEndpoint: normalizeIotEndpoint(iotRaw),
  };

  return {
    version: 1,
    sdk: ESPRMNG_BASE_SDK_ID,
    config,
  };
}
