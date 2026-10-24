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
  ESPRMNeoMatter_BASE_SDK_ID,
} from "@config/sdk.identifiers";
import classicLogo from "@assets/images/rainmaker-classic-logo.png";
import neoLogo from "@assets/images/rainmaker-neo-logo.png";

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
 * can technically reuse an SDK id (RMNeo / RM), so URL is what distinguishes
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
    (sdk === ESPRMNeo_BASE_SDK_ID || sdk === ESPRMNeoMatter_BASE_SDK_ID) &&
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
 * Returns the bundled logo image for a deployment kind. A private deployment
 * has none, so callers show its label instead.
 * @param kind - Deployment kind to look up
 * @returns The logo image, or undefined for a private deployment
 */
export function getDeploymentLogo(
  kind: CurrentDeploymentKind,
): ImageSourcePropType | undefined {
  switch (kind) {
    case DEPLOYMENT_KIND.RMCLASSIC:
      return classicLogo;
    case DEPLOYMENT_KIND.RMNEO:
      return neoLogo;
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
