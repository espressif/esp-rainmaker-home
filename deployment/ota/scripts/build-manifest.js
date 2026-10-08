#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Builds an expo-updates HTTP-protocol manifest for the exported JS bundle.
 *
 * Reads dist-ota/metadata.json, computes sha256/base64url for the launch
 * bundle and every referenced asset, and writes dist-ota/manifest-<platform>.json.
 * Signs the manifest with deployment/ota/certs/private-key.pem — see deployment/ota/README.md for
 * where the key lives in each environment and the rotation procedure.
 *
 * Usage:
 *   node deployment/ota/scripts/build-manifest.js <baseUrl> [platform]
 *
 * Example:
 *   node deployment/ota/scripts/build-manifest.js http://192.168.20.249:8080 ios
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { resolveRuntimeVersion } = require("./sync-runtime-version");
const { ROOT } = require("./_lib");

const [, , baseUrlArg, platformArg = "ios"] = process.argv;
if (!baseUrlArg) {
  console.error("Usage: node deployment/ota/scripts/build-manifest.js <baseUrl> [platform]");
  process.exit(1);
}
const baseUrl = baseUrlArg.replace(/\/$/, "");
const platform = platformArg;

const distDir = path.join(ROOT, "dist-ota");
const metadataPath = path.join(distDir, "metadata.json");
if (!fs.existsSync(metadataPath)) {
  console.error(`Not found: ${metadataPath}`);
  console.error(`Run \`npx expo export --platform ${platform} --output-dir dist-ota\` first.`);
  process.exit(1);
}
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const platformMeta = metadata.fileMetadata[platform];
if (!platformMeta) {
  console.error(`No metadata for platform "${platform}". Available: ${Object.keys(metadata.fileMetadata).join(", ")}`);
  process.exit(1);
}

// Resolved after the metadata check so we don't pay the ~30s expo-updates
// subprocess cost just to hear about a missing dist-ota/.
const RUNTIME_VERSION = resolveRuntimeVersion(platform);

const CONTENT_TYPE_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ttf: "font/ttf",
  otf: "font/otf",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function sha256Base64Url(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("base64url");
}

const bundlePath = path.join(distDir, platformMeta.bundle);
const launchAsset = {
  hash: sha256Base64Url(bundlePath),
  key: path.basename(platformMeta.bundle),
  contentType: "application/javascript",
  url: `${baseUrl}/${platformMeta.bundle}`,
};

const assets = platformMeta.assets.map((asset) => {
  const localPath = path.join(distDir, asset.path);
  return {
    hash: sha256Base64Url(localPath),
    key: path.basename(asset.path),
    contentType: CONTENT_TYPE_BY_EXT[asset.ext] || "application/octet-stream",
    fileExtension: `.${asset.ext}`,
    url: `${baseUrl}/${asset.path}`,
  };
});

// Overridable via OTA_CREATED_AT for diagnostic scenarios where the freshness
// comparison needs to be bypassed; production leaves it unset.
const createdAt = process.env.OTA_CREATED_AT || new Date().toISOString();

// Resolve app.config.ts. `manifest.extra.expoClient` is what expo-updates
// serves as `Constants.expoConfig` at runtime (verified in
// node_modules/expo-manifests/ios/EXManifests/ExpoUpdatesManifest.swift).
// Hard-fail on error — a manifest with a broken `extra` block would fail at
// runtime for any JS reading `Constants.expoConfig.<...>`.
let expoConfig;
try {
  expoConfig = JSON.parse(
    execFileSync("npx", ["expo", "config", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    })
  );
} catch (err) {
  console.error(`ERROR: could not read app.config.ts via 'expo config --json': ${err.message}`);
  process.exit(1);
}

const manifest = {
  id: crypto.randomUUID(),
  createdAt,
  runtimeVersion: RUNTIME_VERSION,
  launchAsset,
  assets,
  metadata: {},
  extra: {
    // scopeKey (required by EXManifests) — the app's slug scopes the update
    // cache to this app; any stable per-app identifier works.
    scopeKey: expoConfig.slug,
    // Whole resolved app config; becomes Constants.expoConfig on the client
    // (see the block comment above).
    expoClient: expoConfig,
  },
};

// Serialize once — the signature covers exactly the bytes we send.
const manifestJson = JSON.stringify(manifest);

// RSA-SHA256 sign. Private key: deployment/ota/certs/private-key.pem locally (gitignored),
// decoded from OTA_SIGNING_KEY_PEM in CI. Missing key is a hard error;
// see deployment/ota/README.md.
const privateKeyPath = path.join(__dirname, "..", "certs", "private-key.pem");
if (!fs.existsSync(privateKeyPath)) {
  console.error(`ERROR: signing key not found at ${privateKeyPath}`);
  console.error(`  Local:  place the RSA private key at that path (gitignored).`);
  console.error(`  CI:     ensure the OTA_SIGNING_KEY_PEM masked variable is set.`);
  process.exit(1);
}
const signatureBase64 = crypto
  .createSign("RSA-SHA256")
  .update(manifestJson)
  .sign(fs.readFileSync(privateKeyPath), "base64");

const outputPath = path.join(distDir, `manifest-${platform}.json`);
const signaturePath = path.join(distDir, `manifest-${platform}.sig`);
fs.writeFileSync(outputPath, manifestJson);
fs.writeFileSync(signaturePath, signatureBase64);

console.log(`Wrote ${outputPath}`);
console.log(`  runtimeVersion: ${manifest.runtimeVersion}`);
console.log(`  ${assets.length} assets, signed rsa-v1_5-sha256, id=${manifest.id.slice(0, 8)}`);
