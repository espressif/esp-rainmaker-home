/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from "react";
import { Image } from "react-native";

import type { SDKConfig } from "@config/runtime.config";
import type { SDKIdentifier } from "@config/sdk.identifiers";
import { BRAND_LOGO_PREFETCH_TIMEOUT_MS, BRAND_THEME_LIGHT } from "@shared/utils/constants";
import { getLogoUri } from "@shared/runtimeStyle/resolve";
import { previewPublished } from "@shared/runtimeStyle/store";

/** Brand name and logo shown in the trust dialog; not saved. */
export interface DeploymentTrustBrand {
  brandName: string;
  logoUrl: string | null;
}

/** State of the open trust dialog for a scanned or uploaded deployment. */
export interface DeploymentTrustPrompt {
  apiUrl: string;
  /** SDK that will activate if the user trusts this deployment. */
  sdk: SDKIdentifier;
  brand: DeploymentTrustBrand | null;
  /** True while brand.json and the logo are loading. */
  loading: boolean;
}

/** Trust dialog state and handlers returned by {@link useDeploymentTrust}. */
export interface UseDeploymentTrustReturn {
  /** The open dialog's state, or null when it is closed. */
  trustPrompt: DeploymentTrustPrompt | null;
  /**
   * Opens the trust dialog at once and, when the config has a `brandUrl`,
   * loads the brand preview into it.
   * @param sdk - SDK that will activate for this deployment
   * @param config - The deployment's validated config
   * @returns Whether the user trusts the deployment
   */
  askTrust: (sdk: SDKIdentifier, config: SDKConfig) => Promise<boolean>;
  confirmTrust: () => void;
  cancelTrust: () => void;
}

/**
 * Fetches brand.json for the trust dialog without saving it, then prefetches the
 * logo with a timeout.
 * @param brandUrl - Deployment brand.json URL, if any
 * @returns Brand name and logo URL (null if the logo did not load), or null without a brand
 */
async function loadBrandPreview(brandUrl?: string): Promise<DeploymentTrustBrand | null> {
  if (!brandUrl) return null;
  const style = await previewPublished(brandUrl);
  if (!style) return null;

  const logoUrl = getLogoUri(style.config, BRAND_THEME_LIGHT) ?? null;
  if (!logoUrl) {
    return { brandName: style.config.brandName, logoUrl: null };
  }

  const late = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), BRAND_LOGO_PREFETCH_TIMEOUT_MS),
  );
  const loaded = await Promise.race([
    Image.prefetch(logoUrl).then(
      () => true,
      () => false,
    ),
    late,
  ]);
  return {
    brandName: style.config.brandName,
    logoUrl: loaded ? logoUrl : null,
  };
}

/**
 * Holds the trust dialog shown before a scanned deployment is applied;
 * `askTrust` resolves when the user confirms or cancels.
 * @returns The dialog state, `askTrust`, and the confirm and cancel handlers
 */
export function useDeploymentTrust(): UseDeploymentTrustReturn {
  const [trustPrompt, setTrustPrompt] = useState<DeploymentTrustPrompt | null>(null);
  const answerRef = useRef<((trusted: boolean) => void) | null>(null);

  const askTrust = useCallback((sdk: SDKIdentifier, config: SDKConfig) => {
    const apiUrl = config.baseUrl ?? "";
    const needsBrand = Boolean(config.brandUrl);

    return new Promise<boolean>((resolve) => {
      answerRef.current = resolve;
      setTrustPrompt({
        apiUrl,
        sdk,
        brand: null,
        loading: needsBrand,
      });

      if (!needsBrand) return;

      void loadBrandPreview(config.brandUrl).then((brand) => {
        // Skips the update if the dialog was answered while the preview loaded.
        if (answerRef.current !== resolve) return;
        setTrustPrompt({
          apiUrl,
          sdk,
          brand,
          loading: false,
        });
      });
    });
  }, []);

  const answer = useCallback((trusted: boolean) => {
    setTrustPrompt(null);
    answerRef.current?.(trusted);
    answerRef.current = null;
  }, []);

  const confirmTrust = useCallback(() => {
    // Ignore Trust taps while brand assets are still loading.
    if (trustPrompt?.loading) return;
    answer(true);
  }, [answer, trustPrompt?.loading]);

  const cancelTrust = useCallback(() => answer(false), [answer]);

  return { trustPrompt, askTrust, confirmTrust, cancelTrust };
}
