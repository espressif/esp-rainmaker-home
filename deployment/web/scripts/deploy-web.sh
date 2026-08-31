#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#
# Build the Expo web export and sync dist/ to:
#   s3://$APP_ASSETS_S3_BUCKET/web/<env>/<region>/<version>/
# then update latest/ + history + version manifests, and record tracking in
# `deployment/web/cdn.yaml`.
#
# Prerequisites:
#   - Node.js 22+, AWS CLI v2
#   - Exported credentials: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, [AWS_SESSION_TOKEN]
#   - AWS_REGION, APP_ASSETS_S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID
#   - Optional: APP_ASSETS_URL, WEB_DEPLOY_ENV (prod), WEB_DEPLOY_REGION (global|cn)
#   - Optional: SKIP_WEB_BUILD=1 to reuse an existing dist/ (skips build:web only; still runs npm ci)
#   - Optional: WEB_DEPLOY_FORCE=1 to overwrite an existing version prefix (rollback contract off)
#   - .env.web locally, or FS_ENV_WEB_FILE (base64) in CI/CD
#   - Optional local tracking: copy deployment/web/cdn.yaml.example → deployment/web/cdn.yaml
#
# Usage (from repo root):
#   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=...
#   export AWS_REGION=us-east-1
#   export APP_ASSETS_S3_BUCKET=... CLOUDFRONT_DISTRIBUTION_ID=...
#   ./deployment/web/scripts/deploy-web.sh
#   SKIP_WEB_BUILD=1 ./deployment/web/scripts/deploy-web.sh   # upload existing dist/ only
#
# Version is read from package.json "version" (override with WEB_DEPLOY_VERSION).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
# shellcheck source=deployment/web/scripts/lib/web-deploy-common.sh
source "${SCRIPT_DIR}/lib/web-deploy-common.sh"

cd "${ROOT}"

DIST_DIR="${ROOT}/dist"
VERSIONED_DIST_DIR=""

# --- Preflight: AWS, deploy targets, CDN config, web env ----------------------

require_aws_credentials
resolve_web_deploy_targets
prepare_web_env_file

# npm ci here — resolve_web_cdn_target below runs cdn-config.mjs which
# requires the `yaml` package, and the SKIP_WEB_BUILD path still needs
# node_modules for the same reason. A clean CI runner has no node_modules
# yet, so the install has to happen before any node call.
echo "Installing app dependencies…"
npm ci

resolve_web_cdn_target
resolve_web_deploy_version

cleanup_versioned_dist() {
  if [ -n "${VERSIONED_DIST_DIR}" ] && [ -d "${VERSIONED_DIST_DIR}" ]; then
    rm -rf "${VERSIONED_DIST_DIR}"
  fi
}
trap cleanup_versioned_dist EXIT

# --- Build: produce dist/ (unless SKIP_WEB_BUILD=1) ---------------------------

if [ "${SKIP_WEB_BUILD:-0}" = "1" ]; then
  echo "SKIP_WEB_BUILD=1 — reusing existing ${DIST_DIR}/ (skip build:web)"
  if [ ! -d "${DIST_DIR}" ]; then
    echo "Missing ${DIST_DIR}/ — run a full deploy or npm run build:web first"
    exit 1
  fi
else
  echo "Building web export (WEB_BASE_URL=${WEB_BASE_URL})…"
  WEB_BASE_URL="${WEB_BASE_URL}" npm run build:web

  if [ ! -d "${DIST_DIR}" ]; then
    echo "Build output not found at ${DIST_DIR}"
    exit 1
  fi
fi

echo "Rewriting dist/_expo/ for S3 upload…"
"${SCRIPT_DIR}/rewrite-expo-web-export.sh" "${DIST_DIR}"

require_web_dist_layout "${DIST_DIR}"

# --- Publish: immutable web/<env>/<region>/<version>/ -------------------------
#
# rewrite-expo-web-export.sh maps dist/_expo/ → dist/expo/ so aws s3 sync uploads
# bundles (sync skips root paths starting with "_"). --delete is scoped to this
# version prefix only so ota/ and other web versions are untouched.

require_web_version_prefix_unused "${APP_ASSETS_S3_BUCKET}" "${WEB_S3_PREFIX}"

VERSIONED_DIST_DIR="$(prepare_versioned_web_dist_copy "${DIST_DIR}" "${WEB_S3_PREFIX}")"

echo "Hashing versioned dist for provenance…"
# Hash via Node (not a sourced shell helper) so a mid-edit / stale source cannot miss it.
WEB_DEPLOY_DIST_SHA="$(
  node "${SCRIPT_DIR}/lib/cdn-config.mjs" hash-dist --dir "${VERSIONED_DIST_DIR}"
)"
export WEB_DEPLOY_DIST_SHA
echo "Dist SHA-256: ${WEB_DEPLOY_DIST_SHA}"

echo "Uploading s3://${APP_ASSETS_S3_BUCKET}/${WEB_S3_PREFIX}/ …"
sync_web_dist_to_s3_prefix "${VERSIONED_DIST_DIR}" "${APP_ASSETS_S3_BUCKET}" "${WEB_S3_PREFIX}" "delete"

# --- Pointers: latest/, history.jsonl, version-meta, web/version-manifest -----

resolve_web_deploy_git_meta
publish_web_cdn_pointers \
  "${APP_ASSETS_S3_BUCKET}" \
  "${WEB_DEPLOY_VERSION}" \
  "${WEB_DEPLOY_ENV}" \
  "${WEB_DEPLOY_REGION}" \
  "${WEB_DEPLOY_GIT_SHA}" \
  "${WEB_DEPLOY_GIT_BRANCH}" \
  "${WEB_DEPLOY_DIST_SHA}"

SITE_URL=""
if [ -n "${APP_ASSETS_URL:-}" ]; then
  SITE_URL="${APP_ASSETS_URL%/}/${WEB_S3_PREFIX}/"
fi
record_web_cdn_config "${WEB_DEPLOY_VERSION}" "${WEB_S3_PREFIX}" "${SITE_URL}"

# --- CDN: invalidate version + latest + root version-manifest -----------------

DEFAULT_INVALIDATION_PATHS="/${WEB_S3_PREFIX}/* /${WEB_REGION_S3_PREFIX}/latest/* /${WEB_REGION_S3_PREFIX}/history.jsonl /${WEB_REGION_S3_PREFIX}/version-meta.json /web/version-manifest.json"
INVALIDATION_PATHS="${WEB_INVALIDATION_PATHS:-${DEFAULT_INVALIDATION_PATHS}}"
INVALIDATION_ID="$(create_web_cloudfront_invalidation "${CLOUDFRONT_DISTRIBUTION_ID}" "${INVALIDATION_PATHS}")"

# --- Summary ------------------------------------------------------------------

echo
echo "Deploy complete."
echo "  Version:      ${WEB_DEPLOY_VERSION}"
echo "  Env/region:   ${WEB_DEPLOY_ENV}/${WEB_DEPLOY_REGION}"
echo "  Git SHA:      ${WEB_DEPLOY_GIT_SHA:-n/a}"
echo "  Git branch:   ${WEB_DEPLOY_GIT_BRANCH:-n/a}"
echo "  Git author:   ${WEB_DEPLOY_GIT_AUTHOR:-n/a}"
echo "  Deployed by:  ${WEB_DEPLOYED_BY:-n/a}"
echo "  Dist SHA:     ${WEB_DEPLOY_DIST_SHA:-n/a}"
echo "  Invalidation: ${INVALIDATION_ID}"
echo "  S3 path:      s3://${APP_ASSETS_S3_BUCKET}/${WEB_S3_PREFIX}/"
echo "  Latest:       s3://${APP_ASSETS_S3_BUCKET}/${WEB_REGION_S3_PREFIX}/latest/manifest.json"
echo "  Tracking:     deployment/web/cdn.yaml (web.latest)"
if [ -n "${SITE_URL}" ]; then
  echo "  Site URL:     ${SITE_URL}"
fi
if [ -n "${APP_ASSETS_URL:-}" ]; then
  echo "  Latest URL:   ${APP_ASSETS_URL%/}/${WEB_REGION_S3_PREFIX}/latest/"
  echo "  Latest embed: ${APP_ASSETS_URL%/}/${WEB_REGION_S3_PREFIX}/latest/embed"
fi
echo "  SPA note:     CloudFront must rewrite /${WEB_S3_PREFIX}/… → index.html"
echo "                and /${WEB_REGION_S3_PREFIX}/latest[/embed] → latest/index.html"
echo "                (apply/update: ./deployment/web/scripts/apply-web-spa-cloudfront-function.sh)"
