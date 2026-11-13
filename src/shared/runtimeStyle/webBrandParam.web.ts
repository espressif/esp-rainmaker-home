/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { BRAND_URL_PARAM } from "@shared/utils/constants";
import { reloadWebAfterDeploymentChange } from "@shared/utils/webDeploymentReload";
import {
  clearActiveBrandStorageSync,
  persistActiveBrandDocument,
} from "./store.web";
import { encodeUrlStyle, type StyleDocument } from "./schema";

/**
 * Removes `brand` from the query/hash (and storage) and reloads Login when it was present.
 * Other URL params are preserved. Used when switching back to public Classic / Neo.
 * @returns True when a reload was started
 */
export function clearWebBrandUrlHash(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const hadBrand =
    url.searchParams.has(BRAND_URL_PARAM) || hashParams.has(BRAND_URL_PARAM);
  clearActiveBrandStorageSync();
  if (!hadBrand) return false;

  reloadWebAfterDeploymentChange(null);
  return true;
}

/**
 * Persists brand.json and hard-reloads Login with `#brand=<base64url>` so theme + embed pick it up.
 * Other URL query/hash params are preserved.
 * @param document - Full brand document for the private deployment
 */
export function replaceCurrentUrlWithBrandDocument(document: StyleDocument): void {
  if (typeof window === "undefined") return;
  const brandEncoded = encodeUrlStyle(document);
  if (!brandEncoded) {
    if (__DEV__) {
      console.warn("[RuntimeStyle] Could not encode brand document for the URL");
    }
    return;
  }
  void persistActiveBrandDocument(document)
    .catch((error: unknown) => {
      if (__DEV__) {
        console.warn("[RuntimeStyle] Failed to persist brand document", error);
      }
    })
    .finally(() => {
      // Reload even when storage fails (e.g. Safari Private Mode quota) so scan
      // is not left on the success screen. Theme still boots from #brand=.
      reloadWebAfterDeploymentChange(brandEncoded);
    });
}
