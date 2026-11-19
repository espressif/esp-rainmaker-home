/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";
import { PLATFORM_WEB } from "@shared/utils/constants";
import { runtimeConfigManager } from "./runtime.config";
import { getRegionConfig } from "./region.config";
import {
  DEFAULT_ACTIVE_SDK_ID,
  ESPRM_BASE_SDK_ID,
  ESPRMMatter_BASE_SDK_ID,
  ESPRMNeo_BASE_SDK_ID,
  ESPRMNeoMatter_BASE_SDK_ID,
  isRmneoStackSdkId,
  normalizeSdkIdentifier,
  type SDKIdentifier,
} from "./sdk.identifiers";

const isWeb = Platform.OS === PLATFORM_WEB;

type BuiltInTile = "classic" | "neo";

/** Matter adaptor id → base twin for {@link downgradeMatterSdk}. */
const MATTER_TO_BASE: Partial<Record<SDKIdentifier, SDKIdentifier>> = {
  [ESPRMMatter_BASE_SDK_ID]: ESPRM_BASE_SDK_ID,
  [ESPRMNeoMatter_BASE_SDK_ID]: ESPRMNeo_BASE_SDK_ID,
};

/**
 * Region default from `ACTIVE_SDK` in the committed region env files.
 * @returns Canonical SDK id for the active region, or the repo default.
 */
function getEnvDefaultSdkId(): SDKIdentifier {
  return (
    normalizeSdkIdentifier(getRegionConfig().activeSdk) ?? DEFAULT_ACTIVE_SDK_ID
  );
}

/**
 * Whether region `ACTIVE_SDK` is one of the two Matter adaptors.
 * @param envSdk - One of the four {@link SDKIdentifier} values.
 * @returns `true` for `rainmaker-matter-sdk` or `rainmaker-neo-matter-sdk`.
 */
function envIsMatterSdk(envSdk: SDKIdentifier): boolean {
  return (
    envSdk === ESPRMMatter_BASE_SDK_ID || envSdk === ESPRMNeoMatter_BASE_SDK_ID
  );
}

/**
 * Built-in Landing tile from region env: Classic vs Neo stack, base vs Matter pair.
 * @param envSdk - Region `ACTIVE_SDK` (one of four SDK ids).
 * @param tile - RainMaker Classic or Neo tile.
 * @returns SDK id before runtime or platform rules.
 */
function builtInFromEnv(envSdk: SDKIdentifier, tile: BuiltInTile): SDKIdentifier {
  const matter = envIsMatterSdk(envSdk);
  if (tile === "classic") {
    return matter ? ESPRMMatter_BASE_SDK_ID : ESPRM_BASE_SDK_ID;
  }
  return matter ? ESPRMNeoMatter_BASE_SDK_ID : ESPRMNeo_BASE_SDK_ID;
}

/**
 * Whether a persisted runtime id applies to the requested built-in tile.
 * @param tile - Classic or Neo Landing tile.
 * @param runtimeSdk - Persisted active SDK id.
 * @returns `true` when runtime can override env for this tile.
 */
function runtimeMatchesTile(
  tile: BuiltInTile,
  runtimeSdk: SDKIdentifier,
): boolean {
  if (tile === "classic") {
    return (
      runtimeSdk === ESPRM_BASE_SDK_ID || runtimeSdk === ESPRMMatter_BASE_SDK_ID
    );
  }
  return isRmneoStackSdkId(runtimeSdk);
}

/**
 * Downgrades a Matter adaptor id to its base twin when one exists.
 * @param sdk - Candidate session id.
 * @returns Base twin or unchanged id.
 */
function downgradeMatterSdk(sdk: SDKIdentifier): SDKIdentifier {
  return MATTER_TO_BASE[sdk] ?? sdk;
}

/**
 * Applies native rules from region env (Matter downgrade or Neo base → Neo Matter).
 * @param sdk - Candidate after env / runtime pick.
 * @param envSdk - Region `ACTIVE_SDK` value.
 * @returns Native-adjusted id (unchanged on web until {@link finalizeSessionSdkId} downgrade).
 */
function applyNativeRules(
  sdk: SDKIdentifier,
  envSdk: SDKIdentifier,
): SDKIdentifier {
  if (isWeb) {
    return sdk;
  }
  if (envIsMatterSdk(envSdk)) {
    return sdk === ESPRMNeo_BASE_SDK_ID ? ESPRMNeoMatter_BASE_SDK_ID : sdk;
  }
  return downgradeMatterSdk(sdk);
}

/**
 * Native env rules, then {@link downgradeMatterSdk} on web.
 * @param candidate - SDK id after env default and optional runtime override.
 * @param envSdk - Region `ACTIVE_SDK` value.
 * @returns Id safe to persist and pass to adaptors.
 */
function finalizeSessionSdkId(
  candidate: SDKIdentifier,
  envSdk: SDKIdentifier,
): SDKIdentifier {
  const onNative = applyNativeRules(candidate, envSdk);
  return isWeb ? downgradeMatterSdk(onNative) : onNative;
}

/**
 * Built-in Landing adaptor: env default, runtime override when same stack family, then finalize.
 * @param tile - RainMaker Classic or Neo built-in tile.
 * @param runtimeSdk - Persisted id, or omitted to read {@link runtimeConfigManager}.
 * @returns SDK id for the built-in deployment on this platform.
 */
function resolveBuiltInSdkId(
  tile: BuiltInTile,
  runtimeSdk?: SDKIdentifier | null,
): SDKIdentifier {
  const envSdk = getEnvDefaultSdkId();
  const fromEnv = builtInFromEnv(envSdk, tile);
  const persisted =
    runtimeSdk !== undefined ? runtimeSdk : runtimeConfigManager.activeSdk;

  const candidate =
    persisted && runtimeMatchesTile(tile, persisted) ? persisted : fromEnv;

  return finalizeSessionSdkId(candidate, envSdk);
}

/**
 * Built-in RainMaker Classic Landing tile / region default adaptor.
 * @param runtimeSdk - Optional persisted id; when omitted, uses {@link runtimeConfigManager}.
 * @returns Active SDK id for the built-in Classic deployment.
 */
export function getBuiltInClassicSdkId(
  runtimeSdk?: SDKIdentifier | null,
): SDKIdentifier {
  return resolveBuiltInSdkId("classic", runtimeSdk);
}

/**
 * Built-in RainMaker Neo Landing tile and RMNeo client-outputs scans.
 * @param runtimeSdk - Optional persisted id; when omitted, uses {@link runtimeConfigManager}.
 * @returns Active SDK id for the built-in Neo deployment.
 */
export function getBuiltInNeoSdkId(
  runtimeSdk?: SDKIdentifier | null,
): SDKIdentifier {
  return resolveBuiltInSdkId("neo", runtimeSdk);
}

/**
 * Normalizes a scanned or persisted SDK id for the session adaptor.
 * @param sdk - Canonical SDK id from storage or config scan.
 * @returns SDK id to persist and pass to {@link getResolvedActiveSdk}.
 */
export function normalizePersistedSdkId(sdk: SDKIdentifier): SDKIdentifier {
  return finalizeSessionSdkId(sdk, getEnvDefaultSdkId());
}

/**
 * Whether the active SDK id matches the built-in RainMaker Classic tile.
 * @param sdk - Persisted active SDK id.
 * @returns `true` when the id is the built-in Classic adaptor for this platform.
 */
export function isBuiltInClassicSdkId(sdk: SDKIdentifier | null): boolean {
  if (sdk === null) {
    return false;
  }
  return sdk === getBuiltInClassicSdkId();
}

/**
 * Whether the active SDK id matches the built-in RainMaker Neo tile.
 * @param sdk - Persisted active SDK id.
 * @returns `true` when the id is the built-in Neo adaptor for this platform.
 */
export function isBuiltInNeoSdkId(sdk: SDKIdentifier | null): boolean {
  if (sdk === null) {
    return false;
  }
  return sdk === getBuiltInNeoSdkId();
}
