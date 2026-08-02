/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ImageSourcePropType } from "react-native";

import { runtimeConfigManager } from "@config/runtime.config";
import { getRegionConfig, isCnRegion } from "@config/region.config";
import { getFeatures } from "@config/features.config";
import {
  ESPRMMatter_BASE_SDK_ID,
  ESPRMNeo_BASE_SDK_ID,
} from "@config/sdk.identifiers";
import classicWordmark from "@assets/images/rainmaker-classic-wordmark.png";
import neoWordmark from "@assets/images/rainmaker-neo-wordmark.png";

/**
 * The three Landing choices, named so call sites compare against a constant
 * instead of a bare string literal.
 */
export const DEPLOYMENT_KIND = {
  RMCLASSIC: "classic",
  RMNEO: "neo",
  PRIVATE: "private",
} as const;

/** Which of the three Landing choices the currently-active runtime matches. */
export type CurrentDeploymentKind =
  (typeof DEPLOYMENT_KIND)[keyof typeof DEPLOYMENT_KIND];

/**
 * Resolves the active runtime backend to one of the three Landing choices,
 * for display in the Login screen banner and the Landing tile "current" chip.
 *
 * Built-in RainMaker Classic / RainMaker Neo are detected by matching both the SDK id and the
 * base URL against the region's committed defaults — a QR-scanned config
 * can technically reuse an SDK id (RMNG / RM), so URL is what distinguishes
 * "picked the tile" from "scanned a custom instance running the same stack".
 * Returns `null` before any selection is persisted (Landing hasn't been
 * passed yet), so callers can hide the banner.
 */
export function getCurrentDeploymentKind(): CurrentDeploymentKind | null {
  if (!runtimeConfigManager.isRuntimeConfigActive) return null;
  const sdk = runtimeConfigManager.activeSdk;
  const baseUrl = runtimeConfigManager.config?.baseUrl;
  const region = getRegionConfig();

  if (sdk === ESPRMMatter_BASE_SDK_ID && baseUrl === region.rmSdk?.baseUrl) {
    return DEPLOYMENT_KIND.RMCLASSIC;
  }
  if (
    sdk === ESPRMNeo_BASE_SDK_ID &&
    baseUrl === region.rmneoSdk?.baseUrl
  ) {
    return DEPLOYMENT_KIND.RMNEO;
  }
  return DEPLOYMENT_KIND.PRIVATE;
}

/** i18n key for the display label of a given deployment kind. */
export function getDeploymentLabelKey(kind: CurrentDeploymentKind): string {
  switch (kind) {
    case DEPLOYMENT_KIND.RMCLASSIC:
      return "landing.classic.title";
    case DEPLOYMENT_KIND.RMNEO:
      return "landing.neo.title";
    case DEPLOYMENT_KIND.PRIVATE:
      return "landing.ownDeployment.title";
  }
}

/**
 * Official wordmark for a deployment — the standard brand logo with the
 * RainMaker cloud mark removed, since the app's own house mark sits above it.
 * A private deployment has no brand asset; callers fall back to the label.
 */
export function getDeploymentWordmark(
  kind: CurrentDeploymentKind,
): ImageSourcePropType | undefined {
  switch (kind) {
    case DEPLOYMENT_KIND.RMCLASSIC:
      return classicWordmark;
    case DEPLOYMENT_KIND.RMNEO:
      return neoWordmark;
    case DEPLOYMENT_KIND.PRIVATE:
      return undefined;
  }
}

/**
 * Should the pre-auth Landing screen be skipped, routing straight to Login
 * instead? True when:
 * - The build is CN region (Landing doesn't exist for CN).
 * - The `backendSelector` build flag is off.
 * - The user has already picked a backend (persisted runtime config); they
 *   don't need the picker again after logout / account deletion / relaunch.
 *
 * This is the single source of truth for the "Landing vs Login" decision;
 * `app/index.tsx`, the logout flow and the account-deletion flow all consult
 * it so a user only ever sees Landing on truly-first launch.
 */
export function shouldSkipLandingScreen(): boolean {
  return (
    isCnRegion() ||
    !getFeatures().backendSelector ||
    runtimeConfigManager.isRuntimeConfigActive
  );
}

/** Route the user should enter the auth flow at. */
export function getPreAuthRoute(): "/(auth)/Login" | "/(landing)/Landing" {
  return shouldSkipLandingScreen() ? "/(auth)/Login" : "/(landing)/Landing";
}
