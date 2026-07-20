/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from "expo-constants";
import { getLocales } from "expo-localization";

/**
 * Supported deployment regions.
 *
 * - `global`: default RainMaker cloud (api.rainmaker.espressif.com).
 * - `cn`: China mainland cloud (api2.rainmaker.espressif.com.cn).
 */
export const REGION_GLOBAL = "global" as const;
export const REGION_CN = "cn" as const;

/**
 * Build-time region selector value, read from `APP_REGION` in `.env`
 * (surfaced via `app.config.ts` → `extra.appRegion`).
 *
 * - `cn` / `global`: force that region. Used by the Android CN / Global
 *   product flavors, which ship a single region's cloud + legal links.
 * - `auto`: resolve at runtime. Used by the single iOS binary, which selects
 *   CN by device locale and falls back to Global otherwise.
 */
export const REGION_AUTO = "auto" as const;

/** ISO 3166-1 alpha-2 region code (lowercased) for China mainland. */
const CN_REGION_CODE = "cn";

export type AppRegion = typeof REGION_GLOBAL | typeof REGION_CN;
type ConfiguredRegion = AppRegion | typeof REGION_AUTO;

/**
 * Reads the configured region selector from `app.config` extra.
 * Defaults to `auto` when unset so a single iOS binary can resolve by locale.
 * @returns The configured region selector (`global` | `cn` | `auto`).
 */
function getConfiguredRegion(): ConfiguredRegion {
  const value = Constants.expoConfig?.extra?.appRegion as
    | ConfiguredRegion
    | undefined;
  if (value === REGION_CN || value === REGION_GLOBAL) {
    return value;
  }
  return REGION_AUTO;
}

/**
 * Best-effort, synchronous device region-code detection (e.g. "cn").
 *
 * Reads the device's Region setting (iOS: Settings → General → Language &
 * Region → Region) via expo-localization's synchronous `getLocales()`. This is
 * the runtime signal the single iOS binary uses when `APP_REGION=auto`;
 * Android builds force `cn`/`global` via product flavor, so detection never
 * runs there.
 * @returns Lowercased ISO 3166-1 region code, or null when unavailable
 *   (e.g. the native module is absent in a test environment).
 */
function detectDeviceRegionCode(): string | null {
  try {
    return getLocales()[0]?.regionCode?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Region resolved from device detection, cached for the app session.
 *
 * Cached so every consumer — including module-scope reads like the legal-link
 * constants — sees one consistent region per launch. Without this, a user
 * changing the device Region setting mid-session would flip call-time readers
 * (SDK config, login providers) while import-time values stayed frozen,
 * leaving the app half-CN half-global against an already-configured SDK.
 */
let detectedRegion: AppRegion | null = null;

/**
 * Resolves the effective region for the running app, honoring an explicit
 * build-time selector first and falling back to runtime device-region
 * detection (resolved once per launch).
 * @returns `cn` or `global`.
 */
export function getActiveRegion(): AppRegion {
  const configured = getConfiguredRegion();
  if (configured === REGION_CN || configured === REGION_GLOBAL) {
    return configured;
  }
  if (detectedRegion === null) {
    detectedRegion =
      detectDeviceRegionCode() === CN_REGION_CODE ? REGION_CN : REGION_GLOBAL;
  }
  return detectedRegion;
}

/**
 * Convenience predicate for CN-region builds / runtime.
 * @returns True when the active region is CN.
 */
export function isCnRegion(): boolean {
  return getActiveRegion() === REGION_CN;
}

/**
 * i18n key for the active region's display label ("Global" / "China"), for
 * showing which region/flavor the app is running as. Returns a key (not text)
 * so callers translate it with `t()` and it follows the UI language.
 * @returns `layout.shared.regionCn` for CN, else `layout.shared.regionGlobal`.
 */
export function getActiveRegionLabelKey(): string {
  return isCnRegion() ? "layout.shared.regionCn" : "layout.shared.regionGlobal";
}

// ─── Region-scoped runtime config ────────────────────────────────────────────
//
// app.config.ts builds one config block per region (identical shape, from the
// committed .env.global.example / .env.cn.example files) into `extra.regionConfigs`. The
// accessor below resolves the block for the active region. There is
// deliberately NO fallback to the removed legacy keys (extra.rmSdk,
// extra.rmSdkCn, extra.websiteLinks*, extra.activeSdk) — a missing block is a
// broken build and fails fast.

export interface RegionRmSdkConfig {
  baseUrl?: string;
  authUrl?: string;
  version?: string;
  clientId?: string;
  redirectUrl?: string;
  claimUrl?: string;
}

export interface RegionRmngSdkConfig {
  baseUrl?: string;
  apiPath?: string;
  userApiBase?: string;
  userApiBaseUrl?: string;
  userApiPath?: string;
  identityId?: string;
  awsRegion?: string;
  userPoolId?: string;
  clientId?: string;
  iotEndpoint?: string;
}

export interface RegionWebsiteLinks {
  website?: string;
  /**
   * URL template with a `{lang}` placeholder substituted with the active UI
   * language by `getTermsOfUseLink`; a plain URL applies to all languages.
   */
  termsOfUse?: string;
  /**
   * URL template with a `{lang}` placeholder substituted with the active UI
   * language by `getPrivacyPolicyLink`; a plain URL applies to all languages.
   */
  privacyPolicy?: string;
}

export interface RegionFeatures {
  /** Third-party login providers offered in this region, in display order. */
  thirdPartyAuthProviders?: string[];
  /** Region-level feature availability flags (enable* keys, disable-only). */
  [flag: string]: boolean | string[] | undefined;
}

export interface RegionConfig {
  activeSdk?: string;
  rmSdk: RegionRmSdkConfig;
  rmngSdk: RegionRmngSdkConfig;
  websiteLinks: RegionWebsiteLinks;
  features: RegionFeatures;
}

/**
 * Returns the region config block for the active region.
 * @throws Error when `extra.regionConfigs.<region>` is absent — that means the
 *   binary was built from a checkout missing `.env.global.example` / `.env.cn.example` (or a
 *   stale native build predating the regionConfigs scheme). Fail fast rather
 *   than silently running against wrong-cloud defaults.
 */
export function getRegionConfig(): RegionConfig {
  const region = getActiveRegion();
  const config = (
    Constants.expoConfig?.extra?.regionConfigs as
      | Record<AppRegion, RegionConfig>
      | undefined
  )?.[region];
  if (!config) {
    throw new Error(
      `Missing extra.regionConfigs.${region} — rebuild the app with the committed .env.global.example / .env.cn.example region files present.`
    );
  }
  return config;
}
