#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#
# Publish and attach the APP_ASSETS web SPA CloudFront Function
# (deployment/web/cloudfront/web-spa-router.js) as a viewer-request handler
# on the distribution's default cache behavior.
#
# Why: S3 keys are under /web/<env>/<region>/<version>/… CloudFront does not
# map /web/prod/global/6.1.0/ or deep SPA routes to that folder's index.html
# unless a Function (or similar) rewrites the URI; S3 has no `_redirects`-style
# rewrite rules of its own.
#
# Prerequisites:
#   - AWS CLI v2 + credentials with cloudfront:CreateFunction / UpdateFunction /
#     PublishFunction / GetDistributionConfig / UpdateDistribution
#   - CLOUDFRONT_DISTRIBUTION_ID (same as deploy:web)
#
# Usage (from repo root):
#   export AWS_REGION=us-east-1   # CloudFront API is global; region still needed by CLI
#   export CLOUDFRONT_DISTRIBUTION_ID=E…
#   ./deployment/web/scripts/apply-web-spa-cloudfront-function.sh
#
# Optional:
#   WEB_SPA_CF_FUNCTION_NAME  default: rm-app-assets-web-spa-router

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FUNCTION_SOURCE="${SCRIPT_DIR}/../cloudfront/web-spa-router.js"
FUNCTION_NAME="${WEB_SPA_CF_FUNCTION_NAME:-rm-app-assets-web-spa-router}"
COMMENT="APP_ASSETS web SPA router: /web/<env>/<region>/<version>/* → index.html"

: "${CLOUDFRONT_DISTRIBUTION_ID:?Set CLOUDFRONT_DISTRIBUTION_ID}"

if [ ! -f "${FUNCTION_SOURCE}" ]; then
  echo "Missing ${FUNCTION_SOURCE}"
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found — install AWS CLI v2"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to patch the distribution config"
  exit 1
fi

echo "Function name: ${FUNCTION_NAME}"
echo "Distribution:  ${CLOUDFRONT_DISTRIBUTION_ID}"
echo "Source:        ${FUNCTION_SOURCE}"

ETAG=""
if ETAG="$(aws cloudfront describe-function --name "${FUNCTION_NAME}" --query 'ETag' --output text 2>/dev/null)"; then
  echo "Updating existing CloudFront Function…"
  ETAG="$(
    aws cloudfront update-function \
      --name "${FUNCTION_NAME}" \
      --function-config "Comment=${COMMENT},Runtime=cloudfront-js-2.0" \
      --function-code "fileb://${FUNCTION_SOURCE}" \
      --if-match "${ETAG}" \
      --query 'ETag' \
      --output text
  )"
else
  echo "Creating CloudFront Function…"
  ETAG="$(
    aws cloudfront create-function \
      --name "${FUNCTION_NAME}" \
      --function-config "Comment=${COMMENT},Runtime=cloudfront-js-2.0" \
      --function-code "fileb://${FUNCTION_SOURCE}" \
      --query 'ETag' \
      --output text
  )"
fi

echo "Publishing function (ETag ${ETAG})…"
aws cloudfront publish-function \
  --name "${FUNCTION_NAME}" \
  --if-match "${ETAG}" \
  >/dev/null

FUNCTION_ARN="$(
  aws cloudfront describe-function \
    --name "${FUNCTION_NAME}" \
    --stage LIVE \
    --query 'FunctionSummary.FunctionMetadata.FunctionARN' \
    --output text
)"
echo "LIVE function ARN: ${FUNCTION_ARN}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cf-spa.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "Fetching distribution config…"
aws cloudfront get-distribution-config \
  --id "${CLOUDFRONT_DISTRIBUTION_ID}" \
  --output json > "${TMP_DIR}/dist.json"

DIST_ETAG="$(jq -r '.ETag' "${TMP_DIR}/dist.json")"
jq '.DistributionConfig' "${TMP_DIR}/dist.json" > "${TMP_DIR}/config.json"

# Attach (or replace) viewer-request association on the default cache behavior.
jq \
  --arg arn "${FUNCTION_ARN}" \
  '
  .DefaultCacheBehavior.FunctionAssociations = (
    ((.DefaultCacheBehavior.FunctionAssociations.Items // [])
      | map(select(.EventType != "viewer-request"))
      + [{
          EventType: "viewer-request",
          FunctionARN: $arn
        }]
    ) as $items
    | { Quantity: ($items | length), Items: $items }
  )
  ' "${TMP_DIR}/config.json" > "${TMP_DIR}/config.updated.json"

echo "Updating distribution (If-Match ${DIST_ETAG})…"
aws cloudfront update-distribution \
  --id "${CLOUDFRONT_DISTRIBUTION_ID}" \
  --if-match "${DIST_ETAG}" \
  --distribution-config "file://${TMP_DIR}/config.updated.json" \
  --query 'Distribution.Status' \
  --output text

echo
echo "CloudFront Function attached as viewer-request on the default behavior."
echo "Propagation can take several minutes. Then verify:"
echo "  curl -sI \"\${APP_ASSETS_URL%/}/web/prod/global/<version>/\" | head -5"
echo "  curl -sI \"\${APP_ASSETS_URL%/}/web/prod/global/<version>/login\" | head -5"
echo "  curl -sI \"\${APP_ASSETS_URL%/}/web/prod/global/latest/\" | head -5"
echo "  curl -sI \"\${APP_ASSETS_URL%/}/web/prod/global/latest/embed\" | head -5"
echo "Version + login + latest[/embed] should return 200 text/html."
echo "  curl -s \"\${APP_ASSETS_URL%/}/web/prod/global/latest/manifest.json\" | head -c 200"
echo "manifest.json must remain JSON (pointer), not the bounce HTML."
