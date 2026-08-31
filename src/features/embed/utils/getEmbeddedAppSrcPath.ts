/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  WEB_EMBED_APP_SRC_PATH,
  WEB_EMBED_SEGMENT,
} from "@shared/utils/constants";

/**
 * Derives the same-origin app root path from the embed host pathname.
 * Strips a trailing `/embed` so CDN-prefixed hosts
 * (e.g. `/web/prod/global/6.1.0/embed`) load the app under that version
 * prefix instead of the domain root.
 *
 * @param pathname - `window.location.pathname` of the embed host
 * @returns Origin-relative path ending with `/` for the iframe `src`
 */
export function getEmbeddedAppSrcPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  const embedSuffix = `/${WEB_EMBED_SEGMENT}`;
  const withoutEmbed =
    trimmed === embedSuffix || trimmed.endsWith(embedSuffix)
      ? trimmed.slice(0, -embedSuffix.length)
      : trimmed;

  if (!withoutEmbed) {
    return WEB_EMBED_APP_SRC_PATH;
  }

  return withoutEmbed.endsWith("/") ? withoutEmbed : `${withoutEmbed}/`;
}
