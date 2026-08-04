/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNeoRuntimeConfig, ScannedConfigPayload } from "@config/runtime.config";
import { ESPRMNeo_BASE_SDK_ID } from "@config/sdk.config";
import {
  CLIENT_OUTPUTS_DASHBOARD_KEY,
  CLIENT_OUTPUTS_DASHBOARD_URL_FIELD,
  RMNEO_CLIENT_OUTPUTS_BASE_KEY,
  RMNEO_CLIENT_OUTPUTS_USER_BASE_KEY,
} from "@features/config/constants";

/**
 * @param value - Unknown JSON value
 * @returns Whether value is a non-null plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param obj - Record to read
 * @param key - Property name
 * @returns Trimmed non-empty string, or undefined
 */
function readNonEmptyString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Strips scheme from IoT endpoint host strings.
 * @param raw - Endpoint from client-outputs (may include https://)
 * @returns Host-only IoT endpoint
 */
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

/**
 * @param stack - `rmng-base` object
 * @returns Main API gateway URL if present
 */
function pickMainApiUrl(stack: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(stack, "ApiGatewayUrl") ??
    readNonEmptyString(stack, "RMBaseApiEndpointFAE735B6")
  );
}

/**
 * @param userBase - `espuser-base` object
 * @returns User API gateway URL if present
 */
function pickUserApiUrl(userBase: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(userBase, "EspUserApiUrl") ??
    readNonEmptyString(
      userBase,
      "CreateCommonBaseResourcesEspUserApiEndpointB000E4CB"
    )
  );
}

/**
 * Reads the deployment's dashboard origin from a client-outputs document — its own
 * top-level stack, not part of the base stack. Optional: without it the region's
 * default legal links apply.
 * @param doc - Top-level client-outputs JSON
 * @returns Dashboard origin without a trailing slash, or undefined
 */
export function readDashboardUrlFromClientOutputs(
  doc: Record<string, unknown>
): string | undefined {
  const stack = doc[CLIENT_OUTPUTS_DASHBOARD_KEY];
  if (!isPlainObject(stack)) {
    return undefined;
  }
  const url = readNonEmptyString(stack, CLIENT_OUTPUTS_DASHBOARD_URL_FIELD);
  return url ? url.replace(/\/$/, "") : undefined;
}

/**
 * Resolves the RainMaker Neo stack object from a client-outputs document.
 * @param doc - Top-level client-outputs JSON
 * @returns Stack record, or undefined when `rmng-base` is missing
 */
function getNeoStackFromClientOutputs(
  doc: Record<string, unknown>
): Record<string, unknown> | undefined {
  const neo = doc[RMNEO_CLIENT_OUTPUTS_BASE_KEY];
  if (isPlainObject(neo)) {
    return neo;
  }
  return undefined;
}

/**
 * True when JSON looks like a RainMaker Neo client-outputs file
 * (`rmng-base` at the top level).
 * @param value - Parsed scan / fetch payload
 * @returns Whether the value can be mapped via {@link mapRmneoClientOutputsToScannedPayload}
 */
export function isRmneoClientOutputsDoc(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  return getNeoStackFromClientOutputs(value) != null;
}

/**
 * Maps client-outputs.json (S3 / QR) into a scanned RMNeo runtime config.
 * Emits `sdk: rainmaker-neo-base-sdk` and two full URLs (`baseUrl`, `userApiBase`).
 * @param value - Parsed client-outputs document
 * @returns Validatable {@link ScannedConfigPayload} for Config Scan
 */
export function mapRmneoClientOutputsToScannedPayload(
  value: unknown
): ScannedConfigPayload {
  if (!isPlainObject(value)) {
    throw new Error(
      "Not a RMNeo client outputs document (expected a JSON object)."
    );
  }

  const stack = getNeoStackFromClientOutputs(value);
  if (!stack) {
    throw new Error(
      `Not a RMNeo client outputs document (missing ${RMNEO_CLIENT_OUTPUTS_BASE_KEY}).`
    );
  }

  const userBaseRaw = value[RMNEO_CLIENT_OUTPUTS_USER_BASE_KEY];
  if (!isPlainObject(userBaseRaw)) {
    throw new Error(
      `RMNeo client outputs: missing or invalid ${RMNEO_CLIENT_OUTPUTS_USER_BASE_KEY} (required for user API URLs).`
    );
  }

  const mainApi = pickMainApiUrl(stack);
  if (!mainApi) {
    throw new Error(
      "RMNeo client outputs: stack must include ApiGatewayUrl or RMBaseApiEndpointFAE735B6."
    );
  }

  const userApi = pickUserApiUrl(userBaseRaw);
  if (!userApi) {
    throw new Error(
      "RMNeo client outputs: espuser-base must include EspUserApiUrl or CreateCommonBaseResourcesEspUserApiEndpointB000E4CB."
    );
  }

  const awsRegion = readNonEmptyString(stack, "StackRegion");
  const iotRaw = readNonEmptyString(stack, "IoTEndpointUrl");

  if (!awsRegion || !iotRaw) {
    throw new Error(
      "RMNeo client outputs: stack missing one of StackRegion, IoTEndpointUrl."
    );
  }

  const config: ESPRMNeoRuntimeConfig = {
    baseUrl: mainApi,
    userApiBase: userApi,
    awsRegion,
    iotEndpoint: normalizeIotEndpoint(iotRaw),
    dashboardUrl: readDashboardUrlFromClientOutputs(value),
  };

  return {
    version: 1,
    sdk: ESPRMNeo_BASE_SDK_ID,
    config,
  };
}
