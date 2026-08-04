/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import type { ImageSourcePropType } from "react-native";
import { useTranslation } from "react-i18next";

import { getFeatures } from "@config/features.config";

import {
  type CurrentDeploymentKind,
  getCurrentDeploymentKind,
  getDeploymentLabelKey,
  getDeploymentWordmark,
} from "../utils/currentDeployment";

export interface UseDeploymentBrandingReturn {
  /**
   * Which Landing choice is active. Null when the user hasn't picked a
   * backend yet or the build ships without the backend selector — CN-region
   * installs never pass Landing, so they naturally stay null.
   */
  currentDeploymentKind: CurrentDeploymentKind | null;
  /** Translated deployment name; doubles as the wordmark's accessibility label. */
  deploymentLabel?: string;
  /** Official wordmark image; undefined for a private deployment (label renders instead). */
  deploymentWordmark?: ImageSourcePropType;
}

/**
 * Deployment branding shared by every screen that shows the app lockup — the
 * auth screens (Login / Signup / Forgot Password / Change Password) and
 * About: which Landing choice is active, plus the caption bits <Logo /> needs
 * to swap the generic app lockup for the deployment's own mark. Everything
 * resolves to null/undefined until a backend is picked, so those screens keep
 * the plain ESP RainMaker Home logo.
 */
export function useDeploymentBranding(): UseDeploymentBrandingReturn {
  const { t } = useTranslation();

  // Not memoized: reading runtime config is cheap, and it must re-evaluate on
  // re-render so a deployment change (via Landing) is picked up.
  const currentDeploymentKind = getFeatures().backendSelector
    ? getCurrentDeploymentKind()
    : null;

  return useMemo(
    () => ({
      currentDeploymentKind,
      deploymentLabel: currentDeploymentKind
        ? t(getDeploymentLabelKey(currentDeploymentKind))
        : undefined,
      deploymentWordmark: currentDeploymentKind
        ? getDeploymentWordmark(currentDeploymentKind)
        : undefined,
    }),
    [currentDeploymentKind, t],
  );
}
