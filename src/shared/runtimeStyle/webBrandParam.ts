/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StyleDocument } from "./schema";

/**
 * No-op on native.
 * @param _document - Style document for the URL hash
 */
export function replaceCurrentUrlWithBrandDocument(_document: StyleDocument): void {}

/**
 * No-op on native.
 * @returns Always false
 */
export function clearWebBrandUrlHash(): boolean {
  return false;
}
