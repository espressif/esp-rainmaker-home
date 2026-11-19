/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Web: style from URL `brand` (config.ts) or `@esp_runtime_brand_json` (same storage family as runtime config).

import { RUNTIME_CONFIG_STORAGE_KEYS } from "@config/runtime.keys.config";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import { fetchBrandDocumentForUrl } from "./fetchPublishedBrand";
import { parseUrlStyle, type PublishedStyle, type StyleDocument } from "./schema";

/** Same export as on native; rarely thrown on web fetch. */
export class UnreadableStyleError extends Error {}

const LOG_PREFIX = "[RuntimeStyle]";

/**
 * Reads persisted brand JSON synchronously for module boot (AsyncStorage on web uses localStorage).
 * @returns Parsed style document, or null when absent or invalid
 */
function readStoredBrandSync(): StyleDocument | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(RUNTIME_CONFIG_STORAGE_KEYS.ACTIVE_BRAND_JSON);
    if (!raw) return null;
    const { style } = parseUrlStyle(JSON.parse(raw));
    return style ?? null;
  } catch {
    return null;
  }
}

/** Style read once when the module loads; this launch draws it. */
const bootStoredBrand = readStoredBrandSync();

/**
 * @returns Whether a brand document is stored for the active deployment
 */
function hasStoredBrand(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(RUNTIME_CONFIG_STORAGE_KEYS.ACTIVE_BRAND_JSON) !== null;
}

/**
 * Saved style for this launch (see {@link config.ts}).
 * @returns Cached document from runtime storage, or null
 */
export function readSaved(): StyleDocument | null {
  return bootStoredBrand;
}

/**
 * Removes the saved brand from runtime storage immediately (before a hard navigation).
 */
export function clearActiveBrandStorageSync(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(RUNTIME_CONFIG_STORAGE_KEYS.ACTIVE_BRAND_JSON);
}

/**
 * Persists the active deployment brand document (survives refresh and logout clear).
 * @param document - Full brand.json payload for the private deployment
 */
export async function persistActiveBrandDocument(document: StyleDocument): Promise<void> {
  await asyncStorageAdapter.setItem(
    RUNTIME_CONFIG_STORAGE_KEYS.ACTIVE_BRAND_JSON,
    JSON.stringify(document),
  );
}

/**
 * Drops the saved brand when switching to a built-in deployment or on config reset.
 */
export async function clearActiveBrandDocument(): Promise<void> {
  clearActiveBrandStorageSync();
  await asyncStorageAdapter.removeItem(RUNTIME_CONFIG_STORAGE_KEYS.ACTIVE_BRAND_JSON);
}

/**
 * Saves or clears the web brand cache. Returns whether the on-disk value differs from this launch.
 * @param brandUrl - Deployment brand.json URL, or undefined to clear
 * @returns True when a reload would pick up a different style than {@link bootStoredBrand}
 */
export async function syncSaved(brandUrl?: string): Promise<boolean> {
  if (!brandUrl) {
    const had = bootStoredBrand !== null || hasStoredBrand();
    await clearActiveBrandDocument();
    return had;
  }

  const { document, unreadable } = await fetchBrandDocumentForUrl(brandUrl);
  if (unreadable || !document) return false;

  const nextChecksum = document.checksum ?? null;
  const bootChecksum = bootStoredBrand?.checksum ?? null;
  if (nextChecksum === bootChecksum && hasStoredBrand()) {
    return false;
  }

  await persistActiveBrandDocument(document);
  return nextChecksum !== bootChecksum;
}

/**
 * Fetches brand.json for the trust dialog.
 * @param brandUrl - Deployment brand.json URL
 * @returns Parsed style for preview, or null when missing or invalid
 */
export async function previewPublished(brandUrl: string): Promise<PublishedStyle | null> {
  const { document, unreadable } = await fetchBrandDocumentForUrl(brandUrl);
  if (unreadable || !document) return null;
  return document as PublishedStyle;
}

/**
 * Refreshes saved brand from the active deployment URL in the background.
 * @param brandUrl - Active deployment brand.json URL, if any
 */
export function syncOnLaunch(brandUrl?: string): void {
  void syncSaved(brandUrl).catch((error: unknown) => {
    console.warn(`${LOG_PREFIX} Launch style sync failed`, error);
  });
}
