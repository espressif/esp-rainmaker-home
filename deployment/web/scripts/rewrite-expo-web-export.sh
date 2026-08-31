#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#
# Post-build rewrite for Expo web export: dist/_expo/ → dist/expo/
#
# Expo emits bundles under dist/_expo/, but aws s3 sync skips root paths starting
# with "_". Renaming to dist/expo/ and updating references allows a single sync
# upload (see deployment/web/scripts/deploy-web.sh). Invoked by deploy-web only
# — not build:web.
#
# Usage (from repo root):
#   ./deployment/web/scripts/rewrite-expo-web-export.sh [dist-dir]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DIST_DIR="${1:-${ROOT}/dist}"

EXPO_LEGACY_DIR="_expo"
EXPO_DEPLOY_DIR="expo"
PATH_FROM="/_expo/"
PATH_TO="/expo/"

# Replaces PATH_FROM with PATH_TO in a single file (GNU and BSD sed compatible).
_replace_expo_paths_in_file() {
  local file="$1"
  if ! grep -qF "${PATH_FROM}" "${file}" 2>/dev/null; then
    return 0
  fi
  if sed --version 2>/dev/null | grep -q GNU; then
    sed -i "s|${PATH_FROM}|${PATH_TO}|g" "${file}"
  else
    sed -i '' "s|${PATH_FROM}|${PATH_TO}|g" "${file}"
  fi
}

if [ ! -d "${DIST_DIR}" ]; then
  echo "Missing ${DIST_DIR} — run build:web first"
  exit 1
fi

if [ ! -d "${DIST_DIR}/${EXPO_LEGACY_DIR}" ]; then
  if [ -d "${DIST_DIR}/${EXPO_DEPLOY_DIR}/static/js/web" ]; then
    echo "dist/${EXPO_DEPLOY_DIR} already present — rewrite skipped"
    exit 0
  fi
  echo "Missing ${DIST_DIR}/${EXPO_LEGACY_DIR} — SPA JavaScript bundles were not produced"
  exit 1
fi

echo "Rewriting ${PATH_FROM} → ${PATH_TO} under ${DIST_DIR}/ …"

while IFS= read -r -d '' file; do
  _replace_expo_paths_in_file "${file}"
done < <(
  find "${DIST_DIR}" -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' \) -print0
)

# Replace dist/expo when re-deploying — plain `mv _expo expo` nests under expo/ if expo exists.
rm -rf "${DIST_DIR}/${EXPO_DEPLOY_DIR}"
mv "${DIST_DIR}/${EXPO_LEGACY_DIR}" "${DIST_DIR}/${EXPO_DEPLOY_DIR}"
echo "Renamed dist/${EXPO_LEGACY_DIR} → dist/${EXPO_DEPLOY_DIR}"
