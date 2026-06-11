#!/usr/bin/env bash
# Print base64 payloads for GitLab/GitHub Android CI secrets.
# Run from repo root: ./scripts/print-ci-secrets-base64.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# variable_name|relative_path|used_by
SECRETS=(
  "FS_ENV_GLOBAL_FILE|.env.global|global build"
  "FS_ENV_CN_FILE|.env.cn|cn build"
  "FS_KEYSTORE_GLOBAL_FILE|android/app/release.global.keystore|global build"
  "FS_KEYSTORE_CN_FILE|android/app/release.cn.keystore|cn build"
  "FS_GOOGLE_SERVICES_JSON|android/app/google-services.json|global only"
)

print_table_header() {
  printf '%-28s | %-42s | %-12s | %s\n' "CI VARIABLE" "SOURCE FILE" "STATUS" "USED BY"
  printf '%-28s-+-%-42s-+-%-12s-+-%s\n' \
    "----------------------------" "------------------------------------------" "------------" "-----------"
}

print_table_row() {
  local name="$1"
  local rel="$2"
  local used_by="$3"
  local status="$4"
  printf '%-28s | %-42s | %-12s | %s\n' "${name}" "${rel}" "${status}" "${used_by}"
}

echo
echo "Android CI secrets"
echo "=================="
print_table_header

missing=0
declare -a READY_SECRETS=()

for entry in "${SECRETS[@]}"; do
  IFS='|' read -r name rel used_by <<< "${entry}"
  path="${ROOT}/${rel}"
  if [ -f "${path}" ]; then
    print_table_row "${name}" "${rel}" "${used_by}" "OK"
    READY_SECRETS+=("${name}|${path}|${used_by}")
  else
    print_table_row "${name}" "${rel}" "${used_by}" "MISSING"
    missing=1
  fi
done

echo
echo "Notes"
echo "-----"
echo "  keystore.properties  → not a CI secret (prebuild writes from .env)"
echo "  GitLab               → Settings → CI/CD → Variables (masked)"
echo "  GitHub               → Settings → Secrets and variables → Actions"
echo

if [ "${missing}" -ne 0 ]; then
  echo "Fix missing files above, then re-run this script."
  exit 1
fi

echo "Base64 payloads (copy value into matching CI variable)"
echo "===================================================="

for entry in "${READY_SECRETS[@]}"; do
  IFS='|' read -r name path used_by <<< "${entry}"
  rel="${path#${ROOT}/}"
  b64="$(base64 < "${path}" | tr -d '\n')"

  echo
  printf '┌%-78s┐\n' "──────────────────────────────────────────────────────────────────────────────"
  printf '│ %-76s │\n' "CI VARIABLE: ${name}"
  printf '│ %-76s │\n' "SOURCE:      ${rel}"
  printf '│ %-76s │\n' "USED BY:     ${used_by}"
  printf '├%-78s┤\n' "──────────────────────────────────────────────────────────────────────────────"
  printf '│ VALUE (base64):                                                              │\n'
  echo "${b64}"
  printf '└%-78s┘\n' "──────────────────────────────────────────────────────────────────────────────"
done

echo
echo "Done. Paste each VALUE into the matching CI variable / GitHub secret."
