#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Promote a versioned OTA release into the live manifest path so devices see it.
 *
 * Server-side S3 copy from
 *   s3://…/ota/prod/<region>/<platform>/<fingerprint>/<version>/manifest.json
 * to
 *   s3://…/ota/prod/<region>/<platform>/<fingerprint>/latest/manifest.json
 * then invalidates the CloudFront path. Assets aren't moved — the manifest's
 * URLs point back at <version>/ so this is a single-object write.
 *
 * Same shape works for rollback: pass an older <version> to point the live
 * pointer for this fingerprint back at it.
 *
 * Env vars:
 *   APP_ASSETS_S3_BUCKET        — shared bucket name
 *   CLOUDFRONT_DISTRIBUTION_ID  — OTA distribution ID
 *   APP_ASSETS_URL              — OTA CloudFront hostname (used for the closing hint)
 *
 * Usage:
 *   node deployment/ota/scripts/promote.js --region <region> --platform <platform> --version <versionCode>
 */

const { resolveRuntimeVersion } = require("./sync-runtime-version");
const { parsePairArgs, awsRun, awsRunCapture } = require("./_lib");

// ─── Args ────────────────────────────────────────────────────────────────────
const { region, platform, version } = parsePairArgs(process.argv);
if (!region || !platform || !version) {
  console.error(
    "Usage: node deployment/ota/scripts/promote.js --region <region> --platform <platform> --version <versionCode>"
  );
  process.exit(1);
}

// ─── Env ─────────────────────────────────────────────────────────────────────
const BUCKET = process.env.APP_ASSETS_S3_BUCKET;
const DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;
const CLOUDFRONT_URL = process.env.APP_ASSETS_URL;
if (!BUCKET || !DISTRIBUTION_ID) {
  console.error(
    "Missing required env vars: APP_ASSETS_S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID"
  );
  process.exit(1);
}

const fingerprint = resolveRuntimeVersion(platform);
console.log(`== Fingerprint: ${fingerprint}`);

const srcKey = `ota/prod/${region}/${platform}/${fingerprint}/${version}/manifest.json`;
const dstKey = `ota/prod/${region}/${platform}/${fingerprint}/latest/manifest.json`;

// ─── Read signature from source object metadata ─────────────────────────────
// The cache-control change on this copy requires --metadata-directive REPLACE,
// which drops ALL source metadata (including expo-signature). Fetch and
// re-pass it explicitly.
console.log(`== Reading signature metadata from ${srcKey}`);
const head = awsRunCapture([
  "s3api", "head-object",
  "--bucket", BUCKET,
  "--key", srcKey,
  "--query", 'Metadata."expo-signature"',
  "--output", "text",
]);
if (head.status !== 0) {
  console.error(`Failed to head ${srcKey}: ${head.stderr || head.stdout}`);
  process.exit(head.status ?? 1);
}
const signatureHeaderValue = (head.stdout || "").trim();
if (!signatureHeaderValue || signatureHeaderValue === "None") {
  console.error(
    `Source ${srcKey} has no expo-signature metadata. Was it uploaded by a signing-enabled publish?`
  );
  process.exit(1);
}

// ─── Server-side copy → dst ─────────────────────────────────────────────────
// s3api copy-object (rather than `s3 cp`) so we can pass JSON metadata; the
// header value is an RFC 8941 dictionary and contains commas that would
// break `s3 cp`'s Key=Val,Key=Val shorthand.
console.log(`== Promoting ${srcKey} → ${dstKey} (preserving signature metadata)`);
awsRun([
  "s3api", "copy-object",
  "--bucket", BUCKET,
  "--copy-source", `${BUCKET}/${srcKey}`,
  "--key", dstKey,
  "--metadata-directive", "REPLACE",
  "--content-type", "application/json",
  "--cache-control", "no-cache, no-store, must-revalidate",
  "--metadata", JSON.stringify({ "expo-signature": signatureHeaderValue }),
]);

// ─── Invalidate ──────────────────────────────────────────────────────────────
// Invalidate both paths: (a) the fingerprint-partitioned latest/ that S3
// serves and (b) the client-facing flat path the CF Function rewrites into
// (a), which may have cached responses to flush.
const flatKey = `ota/prod/${region}/${platform}/manifest.json`;
console.log(`== Invalidating /${dstKey} and /${flatKey} on CloudFront`);
awsRun([
  "cloudfront", "create-invalidation",
  "--distribution-id", DISTRIBUTION_ID,
  "--paths", `/${dstKey}`, `/${flatKey}`,
]);

console.log(`== Promote complete: ${dstKey}`);
if (CLOUDFRONT_URL) {
  const base = CLOUDFRONT_URL.replace(/^https?:\/\//, "");
  console.log(`   Direct:  curl -sI https://${base}/${dstKey}`);
  console.log(`   Client:  curl -sI -H 'expo-runtime-version: ${fingerprint}' https://${base}/ota/prod/${region}/${platform}/manifest.json`);
}
