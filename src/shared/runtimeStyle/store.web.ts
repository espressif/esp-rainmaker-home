/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Web build of the style store. Web reads its style from the page URL `brand` parameter, so nothing is saved or fetched.

import type { PublishedStyle, StyleDocument } from "./schema";

/** Same export as on native; never thrown on web. */
export class UnreadableStyleError extends Error {}

/**
 * Web has no saved style file.
 * @returns Always null
 */
export function readSaved(): StyleDocument | null {
  return null;
}

/**
 * Web does not sync a saved style.
 * @param _styleUrl - Ignored on web
 * @returns Always false
 */
export async function syncSaved(_styleUrl?: string): Promise<boolean> {
  return false;
}

/**
 * Web does not fetch a published style.
 * @param _brandUrl - Ignored on web
 * @returns Always null
 */
export async function previewPublished(_brandUrl: string): Promise<PublishedStyle | null> {
  return null;
}

/**
 * Web has no launch style sync.
 * @param _styleUrl - Ignored on web
 */
export function syncOnLaunch(_styleUrl?: string): void {}
