# Test Automation

Appium-based UI automation for ESP Rainmaker Home (React Native / Expo). Tests run on physical Android and iOS devices and use BDD feature files (pytest-bdd).

## What's Included

- BDD Scenarios in `tests\` (signup.feature, bluetooth.feature, device_control.feature, scene.feature, etc)
- User management: `tests/01_user_management/*/` - signup, login, forgot password, change password, logout, delete account and third party login (Google and Apple)
- Provisioning: `tests/02_provisioning/` — Scan QR, BLE, SoftAP, on-network, Matter — requires `config/esp_devices.yaml` (the chip is matched per scenario from the firmware bundle; no `--chip` flag)
- Device Control: `tests/03_device_control/` — toggle power, control-screen brightness, colour tab (Hue/Saturation), params over cloud with Wi-Fi off.
- Schedule, Scene, Automation: `tests/04_schedule/`, `tests/05_scene/`, `tests/06_automation/` — create, fire/activate/trigger, verify and delete each on the device
- Config generation for CI: `scripts/ci_setup_config.py` builds `config/*.yaml` from `.example` templates and env vars
- HTML reports with videos and debug artifacts on failure; optional email delivery with previous history run details.

## Prerequisites

Tests run on **physical devices**. One-time setup:

### Python 3.10+
```bash
python3 --version   # or: brew install python@3.10
```

### Appium 2.x
```bash
npm install -g appium
appium driver install uiautomator2   # Android
appium driver install xcuitest       # iOS
```

### Android
- [Android Studio](https://developer.android.com/studio) — SDK Manager → install SDK, Platform-Tools
- Enable **USB debugging** on device: Settings → Developer options
- Export (Linux: use `~/Android/Sdk`; macOS: `~/Library/Android/sdk`):
  ```bash
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
  ```
- Verify: `adb devices` (first column value is UDID)

### iOS (macOS only)
- **Xcode 26+** — [Install from Mac App Store](https://developer.apple.com/xcode/)
- **Command Line Tools**: `xcode-select --install`
- Physical device: trust computer, enable Developer Mode (Settings → Privacy & Security)
- **WebDriverAgent** (for Appium): Build & sign in Xcode — see [Real device config](https://appium.github.io/appium-xcuitest-driver/5.8/real-device-config/). 
  
  Set `xcodeOrgId`, `xcodeSigningId`, `updatedWDABundleId` in `config/app.yaml`.

## How to Run Tests

1. Install dependencies:
   ```bash
   cd test
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. IMPORTANT: Set environment + generate config. On a test runner (e.g. the mac-mini):
   ```bash
   # one-time: put secrets in an untracked file (chmod 600)
   #   ~/.esp_test_secrets.env  ->  export MAILOSAUR_API_KEY=...  (see "Environment Variables")
   source scripts/setup_test_env.sh --config   # exports vars + regenerates config/*.yaml
   ```
   Or manually: `cp ../.env.example ../.env` (in repo root; add secrets), then `python3 scripts/ci_setup_config.py`.

   See [Configuration & environment variables](#configuration--environment-variables) for the full list of what each var does.

3. Build the apps:
   - **Android:** [Building for Production - Android](../README.md#android-release-build)
   - **iOS:** [Building for Production - iOS](../README.md#ios-release-build)

4. Run pytest with `--model`. If the model is not found in config, `config/mobiles.yaml` is auto-synced from connected devices.

   **Required arguments (device):**
   - `--model MODEL`: Device model. Use this command to get the model string:
     ```bash
     adb shell getprop ro.product.model
     ```
     Or if multiple connected devices: `adb -s <UDID> shell getprop ro.product.model`

   **Optional arguments:**
   - `-m MARKER`: Pytest marker filter — `sanity`, `regression` (omit to run all)
   - `--install-app y|n`: Install app before run (default: y)
   - `--start-servers`: Start Appium servers (default: true)
   - `--deployment production`: Deployment from `config/deployment.yaml`

   **Android Quick Run:** Place the APK at `test/artifacts/android/app-release.apk`
   ```bash
   python3 -m pytest --model "SM-S711B" -m regression -v
   ```

   **iOS Quick Run:** To skip reinstall, use `--install-app n`:
   ```bash
   python3 -m pytest --model "iPhone 13" -m sanity -v --install-app n
   ```

   **Parallel runs (Android + iOS):** `./scripts/run_parallel.sh -m sanity` (use `-d 'model,...'` to override devices)

## How to Add Test Cases

1. Add a `.feature` file (Gherkin) in `tests/<feature_name_as_folder>/`.
2. Add step definitions (`@given`, `@when`, `@then`) in the corresponding `test_*.py`; pytest-bdd matches steps by text.
3. Add locators in `locators/<page>.json`; page helpers use them via `get_element_locator()`.
4. For new screens, add a page helper in `utils/page_helpers/` extending `BasePage`.
5. App-side ids come from `testProps("some_id")` (`src/shared/utils/testProps.ts`); for boolean-state ids use `stateTestProps("card_power_state", isOn)` → `card_power_state_on|off` (suffixes overridable, e.g. `enabled`/`disabled`) so tests can read state from the id.

See [pytest-bdd documentation](https://pytest-bdd.readthedocs.io/) for step reuse, parametrization, and shared fixtures.

### Provisioning E2E (`esp_devices.yaml`)

**Wi-Fi is lab-wide** (once under `wifi:` — not per phone model). ESP devices are discovered by MAC via the hardware manager (`test/hardware/`).

```bash
# Provisioning tests (Scan QR, BLE, SoftAP, on-network) — run the whole suite,
# or a single flow by pointing at its folder (e.g. tests/02_provisioning/01_scan_qr/)
python3 -m pytest tests/02_provisioning/ \
  --model "iPhone 13" -m sanity -v
```

| Key | Purpose |
|-----|---------|
| `wifi.ssid` / `wifi.ssid_password` | Lab Wi-Fi for all provisioning tests |
| `firmware_repository.root_dir` | Folder of per-chip firmware bundles (default `firmwares/`) |
| `hardware.lock_db_path` | SQLite lock DB for parallel CI jobs |

Firmware bundles live under `test/firmwares/`, one folder per chip (each with
`build_details.info|txt` and `Firmware/<type>/build/`). The bundle is matched to
the scenario automatically by `chip` / `product` / `prov_mode` from
`build_details`; when several match, the highest Jenkins build number wins.

Provisioning suites under `tests/02_provisioning/`: `01_scan_qr`, `02_bluetooth`
(ESP32-C3, BLE sec1), `03_softap` (ESP32-S2, sec1 no PoP), `04_on_network`
(ESP32-C3, mDNS — needs a device that already holds Wi-Fi credentials).
Shared steps live in `tests/02_provisioning/conftest.py`.

Firmware bundles come from Jenkins: `python scripts/download_firmwares.py`
(needs `JENKINS_URL` / `JENKINS_FIRMWARE_JOB` / `JENKINS_USER` / `JENKINS_API_TOKEN`; optional
`JENKINS_TRIGGER_TOKEN` for `--trigger`). In CI set `DOWNLOAD_FIRMWARES=y` on the test job.
Each variant always resolves the **newest** matching Jenkins build; after a full successful
sweep the script prunes superseded bundle folders, so exactly one (newest) bundle per
variant remains.

**Matter firmware is dynamic**: `download_firmwares.download_matter_image()` fetches the
auto-updated esp-matter light merged image from
`https://espressif.github.io/esp-matter/esp32c3_wifi_matter_light.bin` into
`$FIRMWARE_ROOT/matter/` (ETag-cached; also refreshed by a plain `download_firmwares.py`
run), and the matter conftest generates a **unique factory partition per run** with
`esp-matter-mfg-tool` (random discriminator/passcode → fresh `MT:` QR payload, so nearby
devices flashed with the generic payload can't be commissioned by mistake), locates the
`nvs`/`fctry` offsets from the image's own partition table, flashes both, and verifies
over serial that the device advertises the injected discriminator.

Serial logs: `test/debug/<test_name>/esp32c3_<mac>.log` — QR parsed from RainMaker URL in UART output.

On macOS, a captured/generated QR is saved to `debug/provision_qr.png` and opened with Preview for the phone camera to scan.


## Test Report

- Reports are written to `reports/` by default (configurable via `config/report_config.yaml`)
- HTML report includes charts, per-test hardware info, screen recordings for every test, and screenshots/page source/ADB/iOS logs on failure.  
- Download artifacts, File Jira options per failure test and Previous 5 runs + release history per test (hover shows details)
- `config/report_config.yaml` can enable local HTTP hosting and email delivery (SMTP)
- CI runs generate reports; email recipients come from `config/report_config.yaml` (stakeholders section)

## Configuration & environment variables

There is **one** configuration model with two entry points. Both end by running
`scripts/ci_setup_config.py`, which fills the `config/*.yaml.example` templates
(`${VAR}` / `${VAR:-default}` placeholders) from the environment and writes the
real, **never-committed** `config/*.yaml`.

- **Local runner:** `source scripts/setup_test_env.sh --config`
  exports the non-secret defaults, loads your secrets from `~/.esp_test_secrets.env`,
  then generates the config.
- **CI (GitLab):** the test jobs do `cp .env.example .env` → `. scripts/setup_test_env.sh`
  → `python scripts/ci_setup_config.py`. Secrets come from **GitLab CI/CD variables**
  (Settings → CI/CD → Variables), which are already in the environment, so the
  script's `${VAR:-default}` never overwrites them.

So each variable lives in exactly one of four places:

| Where it lives | Committed? | Contains |
|---|---|---|
| `scripts/setup_test_env.sh` | yes | Non-secret test defaults (deployment, app IDs, paths, SSID) |
| `.env.example` (repo root) | yes | App-build identity / feature flags / SDK endpoints (`cp` → `.env`) |
| GitLab CI/CD variables / `~/.esp_test_secrets.env` | **no** | All secrets + internal endpoints |
| `config/*.yaml` (generated), `config/*.yaml.example` (committed) | generated: no | Final runtime config from the templates |

**Secrets & internal endpoints — never committed.** Set as GitLab CI/CD variables (CI) or in `~/.esp_test_secrets.env` (local):

| Variable | Used for                                                                                                                                                                                                                                                                                               |
|---|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `MAILOSAUR_API_KEY` / `MAILOSAUR_SERVER_ID` / `MAILOSAUR_DOMAIN` | Reading sign-up/reset verification emails (all account tests)                                                                                                                                                                                                                                          |
| `PROVISION_WIFI_PASSWORD` | Password of the Wi-Fi the ESP joins during provisioning                                                                                                                                                                                                                                                |
| `XCODE_ORG_ID` | Apple Team ID for WDA signing (iOS). Find: `security find-identity -v -p codesigning`                                                                                                                                                                                                                  |
| `JENKINS_URL` / `JENKINS_FIRMWARE_JOB` / `JENKINS_USER` / `JENKINS_API_TOKEN` | Firmware download (`scripts/download_firmwares.py`) — the internal build host + job path are env-only, never committed; `JENKINS_TRIGGER_TOKEN` optional                                                                                                                                               |
| `MATTER_CHIP_MAC` | Matter commissioning rig — the dedicated chip's MAC (reserved by MAC; keep it in `ESP_EXCLUDE_MACS` so the rainmaker type pool skips it). Firmware + QR are **dynamic per run** (`scripts/matter_firmware.py`); set `MATTER_FW_BIN` **and** `MATTER_QR` together only to force a static image/payload override |
| `EMAIL_SENDER` / `EMAIL_PASSWORD` | Report email delivery (optional)                                                                                                                                                                                                                                                                       |
| _CI build jobs only:_ `FS_KEYSTORE_FILE` / `FS_KEY_PROPERTIES_FILE` / `FS_GOOGLE_SERVICES_JSON` | Android release signing (base64)                                                                                                                                                                                                                                                                       |
| _CI build jobs only:_ `PRIVATE_TOKEN` / `IOS_P12_PASSWORD` / `IOS_KEYCHAIN_PASSWORD` | iOS release signing                                                                                                                                                                                                                                                                                    |
| _CI test jobs only:_ `GITLAB_MR_TOKEN` | Project access token (`api` scope) for the MR report-link comment                                                                                                                                                                                                                                      |

**Non-secret defaults — committed in `scripts/setup_test_env.sh`** (override via a CI/CD variable or your shell):

| Variable | Default | Used for |
|---|---|---|
| `DEPLOYMENT` | `production` | Which block in `deployment.yaml` (`production` \| `rmng`) |
| `BASE_URL` / `API_VERSION` | `https://api.rainmaker.espressif.com` / `v1` | Compose `DEPLOYMENT_URI` (RainMaker REST base) |
| `DEPLOYMENT_PASSWORD` | `Welcome01` | Default password for created accounts |
| `PROVISION_WIFI_SSID` | `ESP_WIFI` | SSID the ESP joins (override per lab) |
| `ANDROID_HOME` | `~/Library/Android/sdk` | Android SDK; in CI set it to the SDK path installed on the runner. `ANDROID_PATH` is derived from it |
| `ANDROID_APP_APPLICATION_ID` / `IOS_APP_APPLICATION_ID` / `APP_ACTIVITY` | `com.espressif.novahome` / `com.espressif.nova` / `com.app.MainActivity` | App under test |
| `IPA_PATH` | `artifacts/ios/app-release.ipa` | iOS binary (Android apk: `artifacts/android/app-release.apk`) |
| `XCODE_SIGNING_ID` / `UPDATED_WDA_BUNDLE_ID` | `Apple Development` / `com.espressif.WebDriverAgentRunner` | WDA signing identity + bundle id |
| `FIRMWARE_ROOT` | `firmwares` | Per-chip firmware bundles (relative to `test/`) |
| `STAKEHOLDER_DEFAULT_RECIPIENTS` / `STAKEHOLDER_SANITY_RECIPIENTS` / `STAKEHOLDER_REGRESSION_RECIPIENTS` | _(empty)_ | JSON arrays of report-email recipients (optional) |

**Hardware partitioning — per run/job** (parallel Android+iOS runs on one rig; unset = single run owns every chip):

| Variable | Default | Used for |
|---|---|---|
| `ESP_EXCLUDE_MACS` | _(empty)_ | Chips this run must never reserve (the other run's partition + the Matter chip, which is reserved by MAC, not from the type pool) |
| `ESP_EXCLUDE_PORTS` | _(empty)_ | Serial ports this run must never probe — set it **together with** `ESP_EXCLUDE_MACS`: discovery's esptool probes hard-reset chips before the MAC is known. Ports re-enumerate on USB changes; re-map with `python -m esptool --port <p> read_mac` |
| `ESP_LOCK_DB_PATH` | `hardware/.resource_locks.db` | Resource-lock SQLite db; point every concurrent run/executor at **one shared absolute path** or their reservations are invisible to each other |
| `MATTER_DEVICE_NAME` | `Light` | Device name the commissioned Matter node reports |

**Set automatically by GitLab CI** (used by `scripts/notify_mr.py` + reporting, no action needed): `CI_*`, `GITLAB_USER_EMAIL` / `GITLAB_USER_NAME`, `BUILD_ID`, `RUN_SUMMARY_FILE`, `ESP_RAINMAKER_BRANCH` (default `master`). Per-run job overrides: `MODEL` (Android), `IOS_MODEL` (iOS), `MARKER`, `DOWNLOAD_FIRMWARES`. The pipeline triggerer (`GITLAB_USER_EMAIL`) is always added to the report-email recipients.
