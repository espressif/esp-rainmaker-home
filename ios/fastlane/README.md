# iOS Fastlane — ad-hoc IPA build

Builds a signed ad-hoc IPA with `bundle exec fastlane ios adhoc`. Output: `artifacts/ios/` (name from `IOS_OUTPUT_IPA_NAME`).

**This lane is GitLab-only.** Signing material is downloaded from [GitLab Secure Files](https://docs.gitlab.com/ee/ci/secure_files/) on each run.

All configuration comes from **process environment variables**. The Fastfile does not read any `.env` file.

**Two different env mechanisms (do not confuse them):**

| Purpose | Location | Used by |
|---------|----------|---------|
| **iOS code signing** | GitLab CI/CD Variables + `~/.esp-rainmaker-ios-fastlane.env` | `ios/fastlane/Fastfile` |
| **Expo app config** (bundle ID, SDK URLs, flags) | Repo-root `.env` (from `.env.example` in CI) | `npm run prebuild:ios` → `scripts/sync-env-to-ios.js` |

---

## Where each variable lives

| Layer | Variables | How CI gets them |
|-------|-----------|------------------|
| **GitLab CI/CD Variables** (masked + protected) | `IOS_P12_PASSWORD`, `IOS_KEYCHAIN_PASSWORD`, `XCODE_ORG_ID`, `PRIVATE_TOKEN` | Injected by GitLab on every job |
| **mac-mini-runner file** | `IOS_CERTIFICATE_FILE`, `IOS_PROFILE_FILES`, `IOS_XCODE_TARGETS`, `IOS_BUNDLE_IDS`, `IOS_PROFILE_NAMES`, `IOS_SCHEME`, `IOS_OUTPUT_IPA_NAME` | File `~/.esp-rainmaker-ios-fastlane.env`, **sourced explicitly in `.gitlab-ci.yml`** |
| **GitLab CI (automatic)** | `CI_API_V4_URL`, `CI_PROJECT_ID` | Injected on every job |

The `ios_ipa` job loads `~/.esp-rainmaker-ios-fastlane.env` in-script.

---

## GitLab CI/CD Variables (secrets only)

In **Settings → CI/CD → Variables** (masked + protected):

| Variable | Notes |
|----------|-------|
| `IOS_P12_PASSWORD` | Apple Distribution `.p12` export password |
| `IOS_KEYCHAIN_PASSWORD` | Fixed password for ephemeral CI keychain; reuse across jobs |
| `XCODE_ORG_ID` | Apple Developer Team ID, e.g. `ABCDE12345` |
| `PRIVATE_TOKEN` | GitLab token with **`read_api`** (Secure Files download) |

---

## mac-mini-runner file (non-secrets)

Create once on **mac-mini-runner** as the GitLab runner user:

```bash
cat > ~/.esp-rainmaker-ios-fastlane.env << 'EOF'
export IOS_CERTIFICATE_FILE='example_distribution.p12'
export IOS_PROFILE_FILES='example_app_adhoc.mobileprovision,example_extension_adhoc.mobileprovision'
export IOS_XCODE_TARGETS='APP,MyExtension'
export IOS_BUNDLE_IDS='com.example.myapp,com.example.myapp.extension'
export IOS_PROFILE_NAMES='My App Ad Hoc,My Extension Ad Hoc'
export IOS_SCHEME='APP'
export IOS_OUTPUT_IPA_NAME='MyApp-adhoc.ipa'
EOF

chmod 600 ~/.esp-rainmaker-ios-fastlane.env
```

Verify on the runner (non-secret vars only):

```bash
set -a && source ~/.esp-rainmaker-ios-fastlane.env && set +a
env | grep '^IOS_'
```

| Variable | Example value |
|----------|---------------|
| `IOS_CERTIFICATE_FILE` | `example_distribution.p12` |
| `IOS_PROFILE_FILES` | `example_app_adhoc.mobileprovision,example_extension_adhoc.mobileprovision` |
| `IOS_XCODE_TARGETS` | `APP,MyExtension` |
| `IOS_BUNDLE_IDS` | `com.example.myapp,com.example.myapp.extension` |
| `IOS_PROFILE_NAMES` | `My App Ad Hoc,My Extension Ad Hoc` |
| `IOS_SCHEME` | `APP` |
| `IOS_OUTPUT_IPA_NAME` | `MyApp-adhoc.ipa` |

The three lists `IOS_XCODE_TARGETS`, `IOS_BUNDLE_IDS`, and `IOS_PROFILE_NAMES` must have the **same number** of comma-separated entries, in the same order.

Filenames must match **GitLab Secure Files** (see below). Use your real names in `~/.esp-rainmaker-ios-fastlane.env`; examples above are placeholders.

---

## GitLab Secure Files

Upload in **Settings → CI/CD → Secure Files**. Basenames must match `IOS_CERTIFICATE_FILE` and `IOS_PROFILE_FILES`:

| Secure File (example) | Contents |
|-----------------------|----------|
| `example_distribution.p12` | Apple **Distribution** certificate (`.p12` export) |
| `example_app_adhoc.mobileprovision` | Ad-hoc profile for the main app target |
| `example_extension_adhoc.mobileprovision` | Ad-hoc profile for an app extension |

---

## Manual fastlane run on the Mac runner

Export **GitLab secrets** in the shell, then source the mac-mini file:

```bash
export IOS_P12_PASSWORD='…'
export IOS_KEYCHAIN_PASSWORD='…'
export XCODE_ORG_ID='ABCDE12345'
export PRIVATE_TOKEN='glpat-…'

source ~/.esp-rainmaker-ios-fastlane.env

nvm use 22
rbenv global 3.3.6

npm ci
# Repo-root .env = Expo app config for prebuild (not iOS signing — see table above)
cp .env.example .env
npm run prebuild:ios

cd ios/fastlane && bundle install && bundle exec fastlane ios adhoc
```

---

## Runner requirements

| Requirement | Notes |
|-------------|--------|
| **macOS** | Required for codesigning |
| **Xcode** | Version compatible with the app's RN/Expo SDK |
| **Node 22** | CI selects `v22*` via nvm path + `nvm use 22`; verified in job script |
| **Ruby 3.x** | `rbenv`; `bundle install` in `ios/fastlane` |
| **curl** | GitLab Secure Files + Apple WWDR cert download |
| **Login keychain** | Runner user must have `~/Library/Keychains/login.keychain-db` |

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `~/.esp-rainmaker-ios-fastlane.env not found` | Create file on mac-mini-runner as runner user |
| `must be set as a GitLab CI/CD variable` | Add the four secrets in GitLab UI (not on Mac file) |
| `must be set in ${IOS_RUNNER_ENV}` | Add missing `IOS_*` export to mac-mini file |
| Secure file not found | Secure File basename matches env exactly (case-sensitive) |
| `need Node 22, got v25` | `ios_ipa` skips global `before_script` and pins Node 22 in-job; install `nvm install 22` on runner |
| No Apple Distribution identity | `IOS_P12_PASSWORD`, WWDR network access, valid Distribution `.p12` |

---

## Files

| File | Purpose |
|------|---------|
| `Fastfile` | Lanes; reads process env only |
| `Gemfile` / `Gemfile.lock` | fastlane + CocoaPods |
| `.env.example` | Variable name reference (not loaded by Fastfile or CI) |
| `README.md` | This guide |
