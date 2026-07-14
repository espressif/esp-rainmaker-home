# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#
# Exports the non-secret defaults the test suite needs. Safe to commit and to
# source from CI: every line uses `${VAR:-default}`, so a value already in the
# environment (a GitLab CI/CD variable, or your shell) is never clobbered.
#
#   source scripts/setup_test_env.sh           # export vars only
#   source scripts/setup_test_env.sh --config  # also (re)generate config/*.yaml
#
# Secrets and internal endpoints are NOT stored here. On a local runner put them
# in an untracked file (this script loads it); in CI set them as CI/CD variables:
#
#   ~/.esp_test_secrets.env   (chmod 600)  e.g.
#     export MAILOSAUR_API_KEY=...
#     export MAILOSAUR_SERVER_ID=...
#     export MAILOSAUR_DOMAIN=...
#     export PROVISION_WIFI_PASSWORD=...
#     export XCODE_ORG_ID=...          # Apple Team ID
#     export JENKINS_USER=...          # firmware download (scripts/download_firmwares.py)
#     export JENKINS_API_TOKEN=...
#     export JENKINS_URL=...           # internal firmware-build server base URL

# --- Load secrets (untracked) -------------------------------------------------
[ -f "$HOME/.esp_test_secrets.env" ] && . "$HOME/.esp_test_secrets.env"

# --- Homebrew/system tools on PATH (ffmpeg for screen recording, appium, etc.) -
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# --- Node/Appium via nvm ------------------------------------------------------
# A stale inherited NVM_DIR (e.g. a CI/CD variable left over from another runner)
# would point at a path with no nvm.sh, so nvm never loads and `appium` is off
# PATH; fall back to this user's ~/.nvm, then select a node version explicitly.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] || export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
fi

# --- Android SDK --------------------------------------------------------------
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_PATH="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

# --- App under test (identity + binaries) -------------------------------------
export ANDROID_APP_APPLICATION_ID="${ANDROID_APP_APPLICATION_ID:-com.espressif.novahome}"
export IOS_APP_APPLICATION_ID="${IOS_APP_APPLICATION_ID:-com.espressif.nova}"
export APP_ACTIVITY="${APP_ACTIVITY:-com.app.MainActivity}"
# Built/installed binaries (defaults resolve under test/artifacts/):
export IPA_PATH="${IPA_PATH:-artifacts/ios/app-release.ipa}"
# ANDROID apk_path defaults to artifacts/android/app-release.apk in app.yaml.

# --- Backend (RainMaker API) --------------------------------------------------
export BASE_URL="${BASE_URL:-https://api.rainmaker.espressif.com}"
export API_VERSION="${API_VERSION:-v1}"
export DEPLOYMENT_URI="${DEPLOYMENT_URI:-$BASE_URL/$API_VERSION}"
export DEPLOYMENT_PASSWORD="${DEPLOYMENT_PASSWORD:-Welcome01}"
# Which deployment block in config/deployment.yaml to use (production | rmng):
export DEPLOYMENT="${DEPLOYMENT:-production}"

# --- Email verification (Mailosaur) — REQUIRED for sign-up/login tests --------
# Set MAILOSAUR_API_KEY / MAILOSAUR_SERVER_ID / MAILOSAUR_DOMAIN in the secrets file.

# --- Wi-Fi used for provisioning (AP the ESP joins) ---------------------------
# Override PROVISION_WIFI_SSID for your lab; password goes in the secrets file.
export PROVISION_WIFI_SSID="${PROVISION_WIFI_SSID:-ESP_App_Framework}"

# --- iOS / WebDriverAgent signing ---------------------------------------------
# XCODE_ORG_ID (Apple Team ID): set in the secrets file. Find it with:
#   security find-identity -v -p codesigning   (or Xcode > Settings > Accounts)
export XCODE_SIGNING_ID="${XCODE_SIGNING_ID:-Apple Development}"
export UPDATED_WDA_BUNDLE_ID="${UPDATED_WDA_BUNDLE_ID:-com.espressif.WebDriverAgentRunner}"
# Appium builds WebDriverAgent fresh from the signed-in Apple account; no
# prebuilt-WDA bootstrap is used.

# --- Firmware -----------------------------------------------------------------
export FIRMWARE_ROOT="${FIRMWARE_ROOT:-firmwares}"

# --- Jenkins (firmware download, scripts/download_firmwares.py) ---------------
# JENKINS_URL / JENKINS_USER / JENKINS_API_TOKEN: set in the secrets file
# (the firmware-build host is internal — keep it out of source control).

# --- Report hosting + scan-QR (optional) --------------------------------------
# REPORT_BASE_URL: where report artifacts are served. Leave UNSET to use this
#   host's name (http://<hostname>:8000) — correct on whichever runner reports
#   (e.g. the mac-mini for iOS). Set only to pin a fixed/DNS host.
# QR_SCREEN_WIDTH: display width in px for right-aligning the scan-QR window on
#   iOS (default 1440); set if this runner's screen differs.

# --- Report email + stakeholders (optional) -----------------------------------
# EMAIL_SMTP_SERVER/PORT default in config/report_config.yaml.example. Set
# EMAIL_SENDER / EMAIL_PASSWORD / STAKEHOLDER_*_RECIPIENTS only to email reports.

# --- Summary ------------------------------------------------------------------
_missing=""
for v in MAILOSAUR_API_KEY MAILOSAUR_SERVER_ID MAILOSAUR_DOMAIN PROVISION_WIFI_PASSWORD XCODE_ORG_ID \
         GOOGLE_OAUTH_EMAIL GOOGLE_OAUTH_PASSWORD GOOGLE_OAUTH_TOTP_SECRET APPLE_OAUTH_EMAIL APPLE_OAUTH_PASSWORD; do
  eval "val=\${$v:-}"
  [ -z "$val" ] && _missing="$_missing $v"
done
echo "[setup_test_env] DEPLOYMENT=$DEPLOYMENT URI=$DEPLOYMENT_URI"
echo "[setup_test_env] ANDROID_HOME=$ANDROID_HOME"
echo "[setup_test_env] WiFi SSID=$PROVISION_WIFI_SSID  Firmware root=$FIRMWARE_ROOT"
if [ -n "$_missing" ]; then
  echo "[setup_test_env] MISSING secrets (add to ~/.esp_test_secrets.env):$_missing"
else
  echo "[setup_test_env] all required secrets present"
fi

# --- Optional: regenerate config/*.yaml from .example + these vars ------------
# ${1:-} so sourcing with no args is safe under `set -u` (CI sources this).
if [ "${1:-}" = "--config" ]; then
  python3 "$(dirname "${BASH_SOURCE[0]:-$0}")/ci_setup_config.py"
fi
