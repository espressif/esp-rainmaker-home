# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#
# Shared helpers for web build + publish:
#   s3://…/web/<env>/<region>/<version>/
#   + latest/manifest.json, history.jsonl, version-meta.json
#   + web/version-manifest.json
#   + local tracking in deployment/web/cdn.yaml
#
# Sourced by deployment/web/scripts/deploy-web.sh — do not execute directly.

CDN_CONFIG_JS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cdn-config.mjs"

# Ensures AWS CLI credentials and region are available; exits non-zero when missing.
require_aws_credentials() {
  : "${AWS_ACCESS_KEY_ID:?Set AWS_ACCESS_KEY_ID (CI/CD variable or local export)}"
  : "${AWS_SECRET_ACCESS_KEY:?Set AWS_SECRET_ACCESS_KEY (CI/CD variable or local export)}"

  if [ -z "${AWS_REGION:-}" ] && [ -z "${AWS_DEFAULT_REGION:-}" ]; then
    echo "Set AWS_REGION (e.g. export AWS_REGION=us-east-1)"
    exit 1
  fi

  export AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION}}"

  if ! command -v aws >/dev/null 2>&1; then
    echo "aws CLI not found — install AWS CLI v2"
    exit 1
  fi

  echo "AWS region: ${AWS_REGION}"
  aws sts get-caller-identity >/dev/null
  echo "AWS caller: $(aws sts get-caller-identity --query Arn --output text)"
}

# Sets APP_ASSETS_S3_BUCKET and CLOUDFRONT_DISTRIBUTION_ID from env (required).
resolve_web_deploy_targets() {
  : "${APP_ASSETS_S3_BUCKET:?Set APP_ASSETS_S3_BUCKET (CI/CD variable or local export)}"
  : "${CLOUDFRONT_DISTRIBUTION_ID:?Set CLOUDFRONT_DISTRIBUTION_ID (CI/CD variable or local export)}"

  export APP_ASSETS_S3_BUCKET CLOUDFRONT_DISTRIBUTION_ID

  echo "Deploy target bucket: ${APP_ASSETS_S3_BUCKET}"
  echo "Deploy target distribution: ${CLOUDFRONT_DISTRIBUTION_ID}"
  if [ -n "${APP_ASSETS_URL:-}" ]; then
    echo "Assets URL base: ${APP_ASSETS_URL}"
  fi
}

# Decodes base64 stdin to stdout (GNU and BSD base64 compatible).
_decode_base64() {
  if base64 -d </dev/null 2>/dev/null; then
    base64 -d
  else
    base64 -D
  fi
}

# Ensures Expo web export layout exists under dist/ (bundles live in dist/expo/ after rewrite).
require_web_dist_layout() {
  local dist_dir="$1"

  if [ ! -d "${dist_dir}/expo/static/js/web" ]; then
    echo "Missing ${dist_dir}/expo/static/js/web after build:web — run deployment/web/scripts/rewrite-expo-web-export.sh"
    exit 1
  fi
}

# Ensures `deployment/web/cdn.yaml` exists and loads WEB_DEPLOY_ENV / WEB_DEPLOY_REGION.
resolve_web_cdn_target() {
  node "${CDN_CONFIG_JS}" ensure >/dev/null
  # shellcheck disable=SC1090
  eval "$(node "${CDN_CONFIG_JS}" resolve-web)"
  export WEB_DEPLOY_ENV WEB_DEPLOY_REGION WEB_REGION_S3_PREFIX
  echo "CDN config: ${CDN_CONFIG_PATH}"
  echo "Web deploy env/region: ${WEB_DEPLOY_ENV}/${WEB_DEPLOY_REGION}"
}

# Reads deploy version from WEB_DEPLOY_VERSION or package.json "version".
# Sets WEB_S3_PREFIX to web/<env>/<region>/<version>.
resolve_web_deploy_version() {
  if [ -n "${WEB_DEPLOY_VERSION:-}" ]; then
    WEB_DEPLOY_VERSION="${WEB_DEPLOY_VERSION}"
  else
    WEB_DEPLOY_VERSION="$(node -p "require('${ROOT}/package.json').version")"
  fi

  if ! [[ "${WEB_DEPLOY_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid web deploy version '${WEB_DEPLOY_VERSION}' — expected semver (e.g. 6.1.0)"
    exit 1
  fi

  : "${WEB_DEPLOY_ENV:?WEB_DEPLOY_ENV unset — call resolve_web_cdn_target first}"
  : "${WEB_DEPLOY_REGION:?WEB_DEPLOY_REGION unset — call resolve_web_cdn_target first}"

  export WEB_DEPLOY_VERSION
  WEB_S3_PREFIX="web/${WEB_DEPLOY_ENV}/${WEB_DEPLOY_REGION}/${WEB_DEPLOY_VERSION}"
  WEB_REGION_S3_PREFIX="web/${WEB_DEPLOY_ENV}/${WEB_DEPLOY_REGION}"
  # Expo Router SPA base (experiments.baseUrl) — must match the CDN path prefix.
  WEB_BASE_URL="/${WEB_S3_PREFIX}"
  export WEB_S3_PREFIX WEB_REGION_S3_PREFIX WEB_BASE_URL
  echo "Web deploy version: ${WEB_DEPLOY_VERSION}"
  echo "S3 prefix: ${WEB_S3_PREFIX}/"
  echo "Web base URL (SPA): ${WEB_BASE_URL}"
}

# Rewrites root-absolute asset paths so the version folder is self-contained
# under /web/<env>/<region>/<version>/.
rewrite_web_dist_version_prefix() {
  local dist_dir="$1"
  local s3_prefix="$2"
  local prefix="/${s3_prefix}"

  echo "Rewriting root paths → ${prefix}/ under ${dist_dir}/ …" >&2

  while IFS= read -r -d '' file; do
    if sed --version 2>/dev/null | grep -q GNU; then
      sed -i \
        -e "s|=\"/expo/|=\"${prefix}/expo/|g" \
        -e "s|=\"/assets/|=\"${prefix}/assets/|g" \
        -e "s|=\"/favicon|=\"${prefix}/favicon|g" \
        -e "s|=\"/firebase-messaging-sw.js\"|=\"${prefix}/firebase-messaging-sw.js\"|g" \
        -e "s|'/expo/|'${prefix}/expo/|g" \
        -e "s|'/assets/|'${prefix}/assets/|g" \
        "${file}"
    else
      sed -i '' \
        -e "s|=\"/expo/|=\"${prefix}/expo/|g" \
        -e "s|=\"/assets/|=\"${prefix}/assets/|g" \
        -e "s|=\"/favicon|=\"${prefix}/favicon|g" \
        -e "s|=\"/firebase-messaging-sw.js\"|=\"${prefix}/firebase-messaging-sw.js\"|g" \
        -e "s|'/expo/|'${prefix}/expo/|g" \
        -e "s|'/assets/|'${prefix}/assets/|g" \
        "${file}"
    fi
  done < <(
    find "${dist_dir}" -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' \) -print0
  )
}

# Copies dist/ to a temp dir and applies version-prefix rewrites for the immutable version folder.
prepare_versioned_web_dist_copy() {
  local dist_dir="$1"
  local s3_prefix="$2"
  local tmp_dir

  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/web-dist.XXXXXX")"
  cp -R "${dist_dir}/." "${tmp_dir}/"
  rewrite_web_dist_version_prefix "${tmp_dir}" "${s3_prefix}"
  printf '%s' "${tmp_dir}"
}

# Uploads dist/expo/ with cp (reliable for large entry multipart) before syncing the rest.
upload_web_expo_bundles() {
  local dist_dir="$1"
  local bucket="$2"
  local s3_prefix="${3:-}"
  local expo_dir="${dist_dir}/expo"
  local destination="s3://${bucket}/"

  if [ ! -d "${expo_dir}" ]; then
    echo "Missing ${expo_dir} — run deployment/web/scripts/rewrite-expo-web-export.sh first"
    exit 1
  fi

  if [ -n "${s3_prefix}" ]; then
    destination="s3://${bucket}/${s3_prefix}/"
  fi

  echo "Uploading ${expo_dir}/ → ${destination}expo/ …"
  aws s3 cp "${expo_dir}/" "${destination}expo/" \
    --recursive \
    --cli-read-timeout 0 \
    --cli-connect-timeout 600
}

# Parses the entry bundle S3 key (no leading slash) from dist/index.html.
_web_entry_s3_key() {
  local dist_dir="$1"
  local s3_prefix="${2:-}"
  local entry_path

  entry_path="$(
    grep -oE 'src="(/[^"]*expo/static/js/web/entry-[^"]+\.js)"' "${dist_dir}/index.html" \
      | head -1 \
      | sed 's/src="//;s/"$//;s|^/||'
  )"

  if [ -z "${entry_path}" ]; then
    return 0
  fi

  if [ -n "${s3_prefix}" ] && [[ "${entry_path}" != "${s3_prefix}/"* ]]; then
    entry_path="${s3_prefix}/${entry_path}"
  fi

  printf '%s' "${entry_path}"
}

# Confirms the entry bundle referenced by index.html exists in the deploy bucket.
verify_web_bundle_upload() {
  local dist_dir="$1"
  local bucket="$2"
  local s3_prefix="${3:-}"
  local entry_key entry_name

  entry_key="$(_web_entry_s3_key "${dist_dir}" "${s3_prefix}")"
  if [ -z "${entry_key}" ]; then
    echo "Could not parse entry script path from ${dist_dir}/index.html"
    exit 1
  fi

  entry_name="${entry_key##*/}"

  if aws s3 ls "s3://${bucket}/${entry_key}" 2>/dev/null | grep -qF "${entry_name}"; then
    echo "Verified upload: s3://${bucket}/${entry_key}"
    return 0
  fi

  echo "Deploy verification failed: s3://${bucket}/${entry_key} not found after upload"
  echo "Expected key must match index.html exactly (hash in filename)."
  exit 1
}

# Refuses to overwrite an existing versioned prefix. Rollback treats every
# web/<env>/<region>/<version>/ folder as immutable (see deployment/web/README.md),
# so re-running the same version silently would let a rollback target drift
# from its original bytes. Pass WEB_DEPLOY_FORCE=1 to opt in to overwrite.
require_web_version_prefix_unused() {
  local bucket="$1"
  local s3_prefix="$2"

  if [ "${WEB_DEPLOY_FORCE:-0}" = "1" ]; then
    echo "WEB_DEPLOY_FORCE=1 — skipping version immutability check for s3://${bucket}/${s3_prefix}/"
    return 0
  fi

  local existing
  existing="$(aws s3api list-objects-v2 \
    --bucket "${bucket}" \
    --prefix "${s3_prefix}/" \
    --max-items 1 \
    --query 'Contents[0].Key' \
    --output text 2>/dev/null || true)"

  if [ -n "${existing}" ] && [ "${existing}" != "None" ]; then
    echo
    echo "Refusing to overwrite existing release: s3://${bucket}/${s3_prefix}/ already exists (contains ${existing})."
    echo "Rollback relies on every version folder being immutable."
    echo
    echo "Options:"
    echo "  - Bump the version in package.json (or export WEB_DEPLOY_VERSION=<new>) and re-run."
    echo "  - Re-run with WEB_DEPLOY_FORCE=1 if you really do want to overwrite this version."
    exit 1
  fi
}

# Mirrors dist/ to s3://bucket/<prefix>/ (optional --delete for that prefix only).
sync_web_dist_to_s3_prefix() {
  local dist_dir="$1"
  local bucket="$2"
  local s3_prefix="$3"
  local delete_flag="${4:-}"
  local sync_args=(sync "${dist_dir}/" "s3://${bucket}/${s3_prefix}/")

  upload_web_expo_bundles "${dist_dir}" "${bucket}" "${s3_prefix}"

  if [ "${delete_flag}" = "delete" ]; then
    sync_args+=(--delete)
  fi

  sync_args+=(
    --cli-read-timeout 0
    --cli-connect-timeout 600
  )

  echo "Syncing ${dist_dir}/ → s3://${bucket}/${s3_prefix}/ …"
  aws s3 "${sync_args[@]}"

  verify_web_bundle_upload "${dist_dir}" "${bucket}" "${s3_prefix}"
}

# Downloads an optional S3 object to a local path (no-op / empty when missing).
download_optional_s3_object() {
  local bucket="$1"
  local key="$2"
  local dest="$3"

  mkdir -p "$(dirname "${dest}")"
  if aws s3 cp "s3://${bucket}/${key}" "${dest}" 2>/dev/null; then
    echo "Fetched s3://${bucket}/${key}"
    return 0
  fi
  rm -f "${dest}"
  return 0
}

# Resolves commit provenance (CI env, else local git).
# Exports WEB_DEPLOY_GIT_SHA, WEB_DEPLOY_GIT_BRANCH, WEB_DEPLOY_GIT_AUTHOR, WEB_DEPLOYED_BY.
# Only sha/branch/dist-sha go into the published pointer files; author and
# deployed_by are recorded in the local deployment/web/cdn.yaml only, so no
# personal names land on the public CDN.
resolve_web_deploy_git_meta() {
  local sha branch author deployed_by

  sha="${CI_COMMIT_SHA:-${GITHUB_SHA:-}}"
  if [ -z "${sha}" ] && command -v git >/dev/null 2>&1; then
    sha="$(git -C "${ROOT}" rev-parse HEAD 2>/dev/null || true)"
  fi

  branch="${CI_COMMIT_BRANCH:-${CI_COMMIT_REF_NAME:-${GITHUB_REF_NAME:-}}}"
  if [ -z "${branch}" ] && command -v git >/dev/null 2>&1; then
    branch="$(git -C "${ROOT}" branch --show-current 2>/dev/null || true)"
    if [ -z "${branch}" ] || [ "${branch}" = "HEAD" ]; then
      branch="$(git -C "${ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    fi
  fi
  if [ "${branch}" = "HEAD" ]; then
    branch=""
  fi

  author=""
  if command -v git >/dev/null 2>&1; then
    author="$(git -C "${ROOT}" log -1 --pretty=format:'%an <%ae>' 2>/dev/null || true)"
  fi

  deployed_by="${GITLAB_USER_NAME:-${GITLAB_USER_LOGIN:-${GITHUB_ACTOR:-}}}"
  if [ -z "${deployed_by}" ] && command -v git >/dev/null 2>&1; then
    deployed_by="$(git -C "${ROOT}" config user.name 2>/dev/null || true)"
  fi
  if [ -z "${deployed_by}" ]; then
    deployed_by="${USER:-${USERNAME:-}}"
  fi

  WEB_DEPLOY_GIT_SHA="${sha}"
  WEB_DEPLOY_GIT_BRANCH="${branch}"
  WEB_DEPLOY_GIT_AUTHOR="${author}"
  WEB_DEPLOYED_BY="${deployed_by}"
  export WEB_DEPLOY_GIT_SHA WEB_DEPLOY_GIT_BRANCH WEB_DEPLOY_GIT_AUTHOR WEB_DEPLOYED_BY

  echo "Git provenance: sha=${WEB_DEPLOY_GIT_SHA:-none} branch=${WEB_DEPLOY_GIT_BRANCH:-none}"
  echo "Git provenance: author=${WEB_DEPLOY_GIT_AUTHOR:-none} deployed_by=${WEB_DEPLOYED_BY:-none}"
}

# SHA-256 of the versioned dist tree that will be (or was) uploaded to S3.
# Prints the hex digest; also exports WEB_DEPLOY_DIST_SHA when used via assign.
hash_web_dist_dir() {
  local dist_dir="$1"

  if [ -z "${dist_dir}" ] || [ ! -d "${dist_dir}" ]; then
    echo "hash_web_dist_dir: missing dist directory: ${dist_dir:-<empty>}" >&2
    exit 1
  fi

  node "${CDN_CONFIG_JS}" hash-dist --dir "${dist_dir}"
}

# Builds pointer artifacts and uploads latest/, history, version-meta, version-manifest.
publish_web_cdn_pointers() {
  local bucket="$1"
  local version="$2"
  local environment="$3"
  local region="$4"
  local git_sha="${5:-${WEB_DEPLOY_GIT_SHA:-}}"
  local git_branch="${6:-${WEB_DEPLOY_GIT_BRANCH:-}}"
  local dist_sha="${7:-${WEB_DEPLOY_DIST_SHA:-}}"
  local pointers_dir existing_history existing_meta existing_manifest
  local region_prefix="web/${environment}/${region}"

  pointers_dir="$(mktemp -d "${TMPDIR:-/tmp}/web-pointers.XXXXXX")"
  existing_history="${pointers_dir}/_existing_history.jsonl"
  existing_meta="${pointers_dir}/_existing_version-meta.json"
  existing_manifest="${pointers_dir}/_existing_version-manifest.json"

  download_optional_s3_object "${bucket}" "${region_prefix}/history.jsonl" "${existing_history}"
  download_optional_s3_object "${bucket}" "${region_prefix}/version-meta.json" "${existing_meta}"
  download_optional_s3_object "${bucket}" "web/version-manifest.json" "${existing_manifest}"

  # shellcheck disable=SC1090
  eval "$(
    node "${CDN_CONFIG_JS}" write-web-pointers \
      --version "${version}" \
      --env "${environment}" \
      --region "${region}" \
      --out-dir "${pointers_dir}" \
      --git-sha "${git_sha}" \
      --git-branch "${git_branch}" \
      --dist-sha "${dist_sha}" \
      --history-path "${existing_history}" \
      --version-meta-path "${existing_meta}" \
      --version-manifest-path "${existing_manifest}"
  )"

  echo "Uploading CDN pointers under s3://${bucket}/${region_prefix}/ …"
  aws s3 cp "${WEB_POINTER_LATEST}" "s3://${bucket}/${region_prefix}/latest/manifest.json"
  # Client bounce page: fetch manifest.json → redirect to /{prefix}/ (or …/embed).
  aws s3 cp "${ROOT}/deployment/web/cdn/latest-redirect.html" \
    "s3://${bucket}/${region_prefix}/latest/index.html" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "max-age=60, must-revalidate"
  aws s3 cp "${WEB_POINTER_HISTORY}" "s3://${bucket}/${region_prefix}/history.jsonl"
  aws s3 cp "${WEB_POINTER_VERSION_META}" "s3://${bucket}/${region_prefix}/version-meta.json"
  aws s3 cp "${WEB_POINTER_VERSION_MANIFEST}" "s3://${bucket}/web/version-manifest.json"

  rm -rf "${pointers_dir}"
}

# Records the successful web publish into `deployment/web/cdn.yaml`.
record_web_cdn_config() {
  local version="$1"
  local prefix="$2"
  local site_url="${3:-}"
  local git_sha="${WEB_DEPLOY_GIT_SHA:-${CI_COMMIT_SHA:-${GITHUB_SHA:-}}}"
  local git_branch="${WEB_DEPLOY_GIT_BRANCH:-}"
  local git_author="${WEB_DEPLOY_GIT_AUTHOR:-}"
  local deployed_by="${WEB_DEPLOYED_BY:-}"
  local dist_sha="${WEB_DEPLOY_DIST_SHA:-}"

  node "${CDN_CONFIG_JS}" record-web \
    --version "${version}" \
    --prefix "${prefix}" \
    --git-sha "${git_sha}" \
    --git-branch "${git_branch}" \
    --git-author "${git_author}" \
    --deployed-by "${deployed_by}" \
    --dist-sha "${dist_sha}" \
    --site-url "${site_url}"
}

# Creates a CloudFront invalidation; prints the invalidation ID.
create_web_cloudfront_invalidation() {
  local distribution_id="$1"
  local invalidation_paths="${2:-/*}"

  echo "Creating CloudFront invalidation (${invalidation_paths})…"
  # shellcheck disable=SC2086
  aws cloudfront create-invalidation \
    --distribution-id "${distribution_id}" \
    --paths ${invalidation_paths} \
    --query 'Invalidation.Id' \
    --output text
}

# Writes .env.web from FS_ENV_WEB_FILE (CI secret) or verifies a local file exists.
prepare_web_env_file() {
  local env_web="${ROOT}/.env.web"

  if [ -n "${FS_ENV_WEB_FILE:-}" ]; then
    umask 077
    printf '%s' "${FS_ENV_WEB_FILE}" | _decode_base64 > "${env_web}"
    echo "Wrote .env.web from FS_ENV_WEB_FILE"
  elif [ ! -f "${env_web}" ]; then
    echo "Missing .env.web (local) or FS_ENV_WEB_FILE (CI/CD base64 secret)"
    exit 1
  fi
}
