#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Copies `.env.web` → `.env` before `npm run web` / `npm run build:web`.
 *
 * Same pattern as Android/iOS (`cp .env.global|.env.cn .env`): Expo loads
 * `.env` into `process.env`, so web feature flags and identity come from
 * `.env.web`. Prefers the local Secure File; falls back to `.env.web.example`.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB_ENV = path.join(ROOT, ".env.web");
const WEB_ENV_EXAMPLE = path.join(ROOT, ".env.web.example");
const DOT_ENV = path.join(ROOT, ".env");

/**
 * Resolves which web env file to copy onto `.env`.
 * @returns {{ source: string, label: string }}
 */
function resolveWebEnvSource() {
  if (fs.existsSync(WEB_ENV) && fs.statSync(WEB_ENV).size > 0) {
    return { source: WEB_ENV, label: ".env.web" };
  }
  if (fs.existsSync(WEB_ENV_EXAMPLE)) {
    return { source: WEB_ENV_EXAMPLE, label: ".env.web.example" };
  }
  throw new Error(
    "Missing .env.web (and .env.web.example). Run `npm run env:pull:web` " +
      "or copy .env.web.example → .env.web and fill in values."
  );
}

/**
 * Writes the resolved web env file over `.env` for Expo to load.
 */
function main() {
  const { source, label } = resolveWebEnvSource();
  fs.copyFileSync(source, DOT_ENV);
  console.log(`[sync-env-to-web] Copied ${label} → .env`);
}

main();
