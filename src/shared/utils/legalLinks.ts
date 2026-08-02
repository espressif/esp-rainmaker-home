/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Terms-of-use and privacy-policy URL resolution.
 *
 * Deliberately NOT in `@shared/utils/constants`: this needs
 * `@config/runtime.config`, which imports the AsyncStorage adaptor, which imports
 * `constants` — so a `constants → runtime.config` edge closes a require cycle and
 * leaves the adaptor's module-scope key list `undefined`.
 */

import { getRegionConfig } from "@config/region.config";
import { runtimeConfigManager } from "@config/runtime.config";

import { LANGUAGE_DEFAULT, SUPPORTED_LANGUAGE_CODES } from "./constants";

// Espressif's pages exist per language × region, so the region env files carry
// them as {lang} templates. Used for the built-in RainMaker Classic and RainMaker Neo selections.
const LEGAL_LINK_LANG_PLACEHOLDER = "{lang}";
const DEFAULT_TERMS_OF_USE_LINK_TEMPLATE =
  "https://rainmaker.espressif.com/{lang}/terms-of-use?region=global";
const DEFAULT_PRIVACY_POLICY_LINK_TEMPLATE =
  "https://rainmaker.espressif.com/{lang}/privacy-policy?region=global";

// A scanned private deployment serves its own pages as static routes under its
// dashboard origin. No {lang} segment, so the language argument is unused there.
const DEPLOYMENT_TERMS_OF_USE_PATH = "/static/terms-of-use";
const DEPLOYMENT_PRIVACY_POLICY_PATH = "/static/privacy-policy";

/**
 * Shown when a private deployment publishes no dashboard origin. Espressif's terms
 * must never stand in for a customer's own, so a blank page is served instead of
 * the region fallback.
 */
const BLANK_LEGAL_PAGE = "about:blank";

/**
 * Dashboard origin of the active deployment, set only for a scanned private one.
 * Read at call time, NOT module scope: the runtime config loads inside
 * `initializeApp()`, which can run after this module is imported.
 */
const getDeploymentDashboardUrl = (): string | undefined =>
  runtimeConfigManager.config?.dashboardUrl?.trim() || undefined;

/**
 * Whether the active config is a scanned private deployment rather than a built-in
 * RainMaker Classic / RainMaker Neo selection.
 *
 * Mirrors `getCurrentDeploymentKind()`; not imported from it because
 * `src/shared` may not depend on `src/features` (`no-shared-to-features`). An
 * inactive runtime config means the build default, which is a built-in.
 */
const isPrivateDeployment = (): boolean => {
  if (!runtimeConfigManager.isRuntimeConfigActive) {
    return false;
  }
  const region = getRegionConfig();
  const baseUrl = runtimeConfigManager.config?.baseUrl;
  return (
    baseUrl !== region.rmSdk?.baseUrl && baseUrl !== region.rmneoSdk?.baseUrl
  );
};

/** Substitutes `{lang}` with the supported UI language (`zh-CN` → `zh`, else `en`). */
const resolveLegalLink = (template: string, language?: string): string => {
  const base = (language || "").toLowerCase().split("-")[0];
  const lang = (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(base)
    ? base
    : LANGUAGE_DEFAULT;
  return template.split(LEGAL_LINK_LANG_PLACEHOLDER).join(lang);
};

/**
 * Resolves one legal page: the deployment's own static route when it publishes a
 * dashboard, a blank page for a private deployment without one, else the region's
 * Espressif template.
 */
const resolveLegalPage = (
  deploymentPath: string,
  regionTemplate: string | undefined,
  fallbackTemplate: string,
  language?: string,
): string => {
  const dashboardUrl = getDeploymentDashboardUrl();
  if (dashboardUrl) {
    return `${dashboardUrl}${deploymentPath}`;
  }
  if (isPrivateDeployment()) {
    return BLANK_LEGAL_PAGE;
  }
  return resolveLegalLink(regionTemplate?.trim() || fallbackTemplate, language);
};

/**
 * Terms of use URL for the given UI language (callers pass `i18n.language`).
 * A private deployment gets its own page, or a blank one if it publishes none;
 * RainMaker Classic and RainMaker Neo intentionally keep the region's Espressif link.
 * @param language Optional UI language tag (e.g. `en`, `zh-CN`).
 * @returns The resolved terms of use URL.
 */
export const getTermsOfUseLink = (language?: string): string =>
  resolveLegalPage(
    DEPLOYMENT_TERMS_OF_USE_PATH,
    getRegionConfig().websiteLinks.termsOfUse,
    DEFAULT_TERMS_OF_USE_LINK_TEMPLATE,
    language,
  );

/**
 * Privacy policy URL for the given UI language (callers pass `i18n.language`).
 * A private deployment gets its own page, or a blank one if it publishes none;
 * RainMaker Classic and RainMaker Neo intentionally keep the region's Espressif link.
 * @param language Optional UI language tag (e.g. `en`, `zh-CN`).
 * @returns The resolved privacy policy URL.
 */
export const getPrivacyPolicyLink = (language?: string): string =>
  resolveLegalPage(
    DEPLOYMENT_PRIVACY_POLICY_PATH,
    getRegionConfig().websiteLinks.privacyPolicy,
    DEFAULT_PRIVACY_POLICY_LINK_TEMPLATE,
    language,
  );
