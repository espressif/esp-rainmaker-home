/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { BRAND_URL_PARAM } from "@shared/utils/constants";

/** Expo web login route segment (URL path, not the `(auth)` group name). */
const WEB_LOGIN_SEGMENT = "Login";

/**
 * @param pathname - Current location pathname
 * @returns Same deploy prefix with the last segment replaced by `Login`
 */
function loginPathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash < 0) {
    return `/${WEB_LOGIN_SEGMENT}`;
  }
  return `${trimmed.slice(0, lastSlash + 1)}${WEB_LOGIN_SEGMENT}`;
}

/**
 * Builds a Login href on the current deploy prefix.
 * Preserves existing query and hash params; only the `brand` param is replaced or removed.
 * @param href - Current location href
 * @param brandEncoded - Base64url brand payload to set on the hash; `null`/`undefined` strips `brand`
 * @returns Absolute Login URL
 */
function webLoginHref(href: string, brandEncoded?: string | null): string {
  const url = new URL(href);
  url.pathname = loginPathname(url.pathname);

  // Brand is carried in the hash (large JSON); never leave a stale query brand.
  url.searchParams.delete(BRAND_URL_PARAM);

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  if (brandEncoded) {
    hashParams.set(BRAND_URL_PARAM, brandEncoded);
  } else {
    hashParams.delete(BRAND_URL_PARAM);
  }
  url.hash = hashParams.toString() ? `#${hashParams.toString()}` : "";

  return url.toString();
}

/**
 * Hard-reloads the web app at Login after a deployment switch (Classic / Neo / private scan).
 * Keeps other URL params; sets or clears only `brand` so runtime style and the `/embed` iframe agree.
 * @param brandEncoded - Encoded `#brand=` value to carry; omit/`null` to clear branding
 */
export function reloadWebAfterDeploymentChange(brandEncoded?: string | null): void {
  if (typeof window === "undefined") return;
  window.location.replace(webLoginHref(window.location.href, brandEncoded));
}
