#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Publish a signed OTA release to S3 under the fingerprint-partitioned prefix.
 *
 * Requires $APP_ASSETS_S3_BUCKET (CI/CD masked variable or local env).
 *
 * S3 layout — see deployment/ota/README.md for the full model:
 *   ota/prod/<region>/<platform>/<fingerprint>/<versionCode>/manifest.json
 *   ota/prod/<region>/<platform>/<fingerprint>/<versionCode>/_expo/…/*.hbc
 *   ota/prod/<region>/<platform>/<fingerprint>/<versionCode>/assets/<hash>
 *
 * The fingerprint is resolved from the current source tree (same value the
 * app binary reports as `expo-runtime-version`); a CloudFront Function at
 * the edge rewrites the client's flat URL into this per-fingerprint path.
 *
 * deployment/ota/scripts/promote.js runs after this to point <fingerprint>/latest/
 * at the release.
 *
 * Usage:
 *   node deployment/ota/scripts/publish.js --region <region> --platform <platform> --version <versionCode>
 */

const fs = require("fs");
const path = require("path");
const { resolveRuntimeVersion } = require("./sync-runtime-version");
const { ROOT, parsePairArgs, awsRun, awsRunCapture } = require("./_lib");

// ─── Args ────────────────────────────────────────────────────────────────────
const { region, platform, version } = parsePairArgs(process.argv);
if (!region || !platform || !version) {
  console.error(
    "Usage: node deployment/ota/scripts/publish.js --region <region> --platform <platform> --version <versionCode>"
  );
  process.exit(1);
}
if (platform !== "ios" && platform !== "android") {
  console.error(`Unsupported platform "${platform}". Use "ios" or "android".`);
  process.exit(1);
}

// ─── Env ─────────────────────────────────────────────────────────────────────
const BUCKET = process.env.APP_ASSETS_S3_BUCKET;
if (!BUCKET) {
  console.error("Missing required env var: APP_ASSETS_S3_BUCKET");
  process.exit(1);
}

// ─── Inputs ──────────────────────────────────────────────────────────────────
const distDir = path.join(ROOT, "dist-ota");
const manifestPath = path.join(distDir, `manifest-${platform}.json`);
if (!fs.existsSync(manifestPath)) {
  console.error(`Missing ${manifestPath}. Run deployment/ota/scripts/build-manifest.js first.`);
  process.exit(1);
}

// ─── Preconditions ───────────────────────────────────────────────────────────
const fingerprint = resolveRuntimeVersion(platform);
const s3Prefix = `s3://${BUCKET}/ota/prod/${region}/${platform}/${fingerprint}/${version}`;
console.log(`== Fingerprint: ${fingerprint}`);

// Immutability: refuse to overwrite an existing versioned release.
const versionedKey = `ota/prod/${region}/${platform}/${fingerprint}/${version}/manifest.json`;
const head = awsRunCapture([
  "s3api", "head-object",
  "--bucket", BUCKET,
  "--key", versionedKey,
]);
if (head.status === 0) {
  console.error(
    `Refusing to overwrite existing release: s3://${BUCKET}/${versionedKey} already exists.`
  );
  console.error("Bump package.json.versionCode and re-run.");
  process.exit(1);
}

// ─── Signature ──────────────────────────────────────────────────────────────
// Uploaded below as manifest.json's x-amz-meta-expo-signature metadata; the
// CloudFront response-headers policy renames it to expo-signature for the
// client. The .sig sidecar stays local.
//
// Value format: RFC 8941 Structured Field dictionary. expo-updates parses the
// header via StructuredHeaders on both platforms; a raw base64 value fails
// parsing → surfaces as "Code signing verification failed". keyid must match
// EXUpdatesCodeSigningMetadata.keyid baked into the app ("main").
const signaturePath = path.join(distDir, `manifest-${platform}.sig`);
if (!fs.existsSync(signaturePath)) {
  console.error(`Missing ${signaturePath}. deployment/ota/scripts/build-manifest.js should have written it.`);
  process.exit(1);
}
const signatureBase64 = fs.readFileSync(signaturePath, "utf8").trim();
const signatureHeaderValue = `sig="${signatureBase64}", keyid="main", alg="rsa-v1_5-sha256"`;

// ─── Upload ──────────────────────────────────────────────────────────────────
// 1) Sync bundle + assets with immutable cache. Manifest and .sig are
//    excluded; manifest is uploaded separately below, .sig stays local.
console.log(`== Syncing bundle + assets → ${s3Prefix}`);
awsRun([
  "s3", "sync",
  distDir, s3Prefix,
  "--exclude", `manifest-${platform}.json`,
  "--exclude", `manifest-${platform}.sig`,
  "--cache-control", "public, max-age=31536000, immutable",
  "--metadata-directive", "REPLACE",
]);

// 2) Manifest last — atomic "release exists" commit point; the assets it
//    references must already be uploaded. Signature rides along as object
//    metadata (see the Signature block above). Uses s3api put-object rather
//    than `s3 cp` so we can pass JSON metadata (the header value contains
//    commas that would break `s3 cp`'s shorthand Key=Val,Key=Val syntax).
console.log(`== Uploading manifest → ${s3Prefix}/manifest.json`);
awsRun([
  "s3api", "put-object",
  "--bucket", BUCKET,
  "--key", versionedKey,
  "--body", manifestPath,
  "--content-type", "application/json",
  "--cache-control", "public, max-age=31536000, immutable",
  "--metadata", JSON.stringify({ "expo-signature": signatureHeaderValue }),
]);

console.log(`== Publish complete: ${s3Prefix}/`);
console.log(`   Next: node deployment/ota/scripts/promote.js --region ${region} --platform ${platform} --version ${version}`);
