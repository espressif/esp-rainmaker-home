# OTA — over-the-air updates for the RainMaker Home app

Everything that publishes, promotes, and verifies OTA JS bundles for the RainMaker Home app lives here. The scripts, the RSA signing keys, and the design docs are all in this folder so the workstream is easy to hand off.

The client side (what the app binary does with a downloaded OTA) lives in native code — expo-updates is configured via `ios/APP/Supporting/Expo.plist` and `android/app/src/main/AndroidManifest.xml`. Those files are hand-maintained; see the "Runtime version" section below for why.

---

## Directory layout

```
ota/
├── README.md                    # this file
├── certs/
│   ├── certificate.pem          # public cert, committed
│   └── private-key.pem          # RSA private key, gitignored
├── scripts/
│   ├── build-manifest.js             # produces the signed OTA manifest
│   ├── publish.js                    # uploads bundle + manifest to S3 under the fingerprint path
│   ├── promote.js                    # copies the versioned manifest to <fingerprint>/latest/
│   ├── sync-runtime-version.js       # derives fingerprint hash, patches native files
│   └── sync-signing-cert.js          # syncs cert PEM into native files (parallel to sync-runtime-version)
└── docs/
    ├── bucket-layout.html       # S3 layout + fingerprint routing design
    ├── phase-1-plan.html        # rollout plan for the fingerprint migration
    └── poc-handoff.html         # POC handoff notes
```

Related config that lives at the repo root (can't move due to tool requirements):

- `fingerprint.config.js` — `@expo/fingerprint` requires it at the project root
- `.gitlab-ci.yml` — GitLab requirement; the two `ota_publish_global_*` jobs orchestrate the scripts above

---

## Publish flow

CI runs both jobs in parallel (one per platform). Each does:

1. **Decode signing key** — the `.ota_signing_key` `!reference` template writes `deployment/ota/certs/private-key.pem` from the `OTA_SIGNING_KEY_PEM` masked variable.
2. **Read `OTA_VERSION`** — from `package.json`'s `versionCode` field, the single monotonic integer that drives both Android's `versionCode` and the OTA release number. Bumping one file updates both the store binary and the next OTA.
3. **Drift checks** — both `sync-runtime-version.js --check` and `sync-signing-cert.js --check` fail the job if the committed native files have drifted from the source of truth (fingerprint hash for the first, cert PEM for the second). Guards against stale native config.
4. **Capture fingerprint** — `--print` mode of `sync-runtime-version.js` emits the hash into an `OTA_FINGERPRINT` env var.
5. **Export bundle** — `npx expo export` produces `dist-ota/` (bundle + assets + metadata).
6. **Build + sign manifest** — `deployment/ota/scripts/build-manifest.js` writes `dist-ota/manifest-<platform>.json` and `dist-ota/manifest-<platform>.sig`. Signing fails hard if the private key isn't present.
7. **Upload** — `deployment/ota/scripts/publish.js` uploads to `s3://…/ota/prod/<region>/<platform>/<fingerprint>/<versionCode>/…` with `immutable` cache headers. The signature travels with the manifest as S3 object metadata (`x-amz-meta-expo-signature`); CloudFront renames it to `expo-signature` at the edge.
8. **Promote** — `deployment/ota/scripts/promote.js` reads the signature back from the source object metadata, server-side-copies the versioned manifest to `<fingerprint>/latest/manifest.json` with the signature preserved and cache-control flipped to `no-cache`, then invalidates CloudFront.
9. **Verify** — final curl in the CI log hits the direct fingerprint URL and expects HTTP 200.

The client's request URL stays flat and fingerprint-agnostic (`.../<platform>/manifest.json`). A CloudFront Function rewrites the request to include the fingerprint from the `expo-runtime-version` header the app sends. See `docs/bucket-layout.html` for the full routing design.

Signature verification is ON in the app (cert PEM baked into `ios/APP/Supporting/Expo.plist` and `android/app/src/main/AndroidManifest.xml` via `sync-signing-cert.js`). Every manifest is verified against the baked-in cert before its bundle is applied; a missing or mismatched signature causes the OTA to be silently rejected and the app stays on its embedded bundle.

---

## CI variables

All set via GitLab → Settings → CI/CD → Variables. Masked + protected.

| Variable | What it is |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM user scoped to the `ota/` prefix of the shared bucket |
| `AWS_REGION` | Bucket region |
| `APP_ASSETS_S3_BUCKET` | Bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | The OTA distribution (separate from the web one) |
| `APP_ASSETS_URL` | CloudFront hostname or full URL for OTA |
| `OTA_SIGNING_KEY_PEM` | Base64 of `deployment/ota/certs/private-key.pem` — see the rotation procedure below |

To (re)generate the base64 payloads for all these, run `./scripts/print-ci-secrets-base64.sh` from the repo root.

For local publishes (open-source forkers, or dev-side troubleshooting), copy `deployment/ota/.env.example` to `deployment/ota/.env.local` (gitignored), populate the values, and source the file before running the scripts. The example lists every variable with a short comment.

---

## Runtime version — fingerprint policy

`app.config.ts` declares `runtimeVersion: { policy: "fingerprint" }`. The effective value is a SHA-1 hash of the app's native surface (native modules, native project files, resolved expo config) computed by `@expo/fingerprint` (configured via `fingerprint.config.js` at the repo root).

The client reports this hash on every OTA fetch as `expo-runtime-version`. The manifest carries the matching hash in its `runtimeVersion` field. If they don't match, the client rejects the OTA silently and stays on the embedded bundle — this is what gates OTA compatibility with the store binary.

The hash is written into two native files (`ios/APP/Supporting/Expo.plist` and `android/app/src/main/AndroidManifest.xml`) by `deployment/ota/scripts/sync-runtime-version.js`. Local devs run it as `node deployment/ota/scripts/sync-runtime-version.js`; CI runs it with `--check` so any commit with drift fails fast.

---

## Signing rotation procedure

Rare event. Applies when the private key leaks, or on a scheduled rotation (RSA-2048, cert valid 10 years — no strict rotation deadline).

1. **Generate a new key pair:**
   ```bash
   npx expo-updates codesigning:generate \
     --key-output-directory ./deployment/ota/certs \
     --certificate-output-directory ./deployment/ota/certs \
     --certificate-validity-duration-years 10 \
     --certificate-common-name "ESP RainMaker Home OTA Signing"
   ```
2. **Update the cert baked into the app.** Replace `deployment/ota/certs/certificate.pem`, then run `node deployment/ota/scripts/sync-signing-cert.js` to update the PEM inline in `ios/APP/Supporting/Expo.plist` and `android/app/src/main/AndroidManifest.xml`.
3. **Update the CI secret:** base64 the new private key and replace the `OTA_SIGNING_KEY_PEM` GitLab CI/CD variable:
   ```bash
   base64 -i deployment/ota/certs/private-key.pem | pbcopy
   ```
4. **Rebuild the app + cut a store release.** Old app binaries have the old cert baked in — they **cannot** verify manifests signed with the new key.
5. **Wait for user adoption of the new store binary.** During the overlap, either keep publishing OTAs under the old key too (dual-sign — not supported natively, requires forked publishing), or stop publishing OTAs for the old binary entirely (its users stay on their embedded bundle).
6. **Once the old binary drops below the OTA-support floor**, retire the old key: replace the private key in your secret store with the new one only.

### Leaked-key incident response

Follow the same procedure, but treat it as urgent:

- If you want the old binary to keep receiving OTAs under the leaked key, accept the risk and skip step 6.
- Otherwise, force-rotate immediately and drop OTA support for the old binary until users update from the store.

### Where the private key lives

- **Local publish:** `deployment/ota/certs/private-key.pem` on disk (gitignored)
- **CI publish:** `OTA_SIGNING_KEY_PEM` masked CI variable → decoded to the same path at job start

Never commit the private key. Never paste it into chat, logs, or config files.

---

## Verification commands

After a CI publish, verify from your terminal:

```bash
FP_IOS=$(node deployment/ota/scripts/sync-runtime-version.js --print --platform ios)
FP_ANDROID=$(node deployment/ota/scripts/sync-runtime-version.js --print --platform android)
CF="app.rainmaker.espressif.com"   # production OTA CloudFront; hostname of APP_ASSETS_URL

# Direct fingerprint URL — always works after publish
curl -s "https://$CF/ota/prod/global/ios/$FP_IOS/latest/manifest.json" \
  | jq '.runtimeVersion, .id, .launchAsset.url'
curl -s "https://$CF/ota/prod/global/android/$FP_ANDROID/latest/manifest.json" \
  | jq '.runtimeVersion, .id, .launchAsset.url'

# Client-facing flat URL — only works after the CloudFront routing Function is deployed
curl -sI -H "expo-runtime-version: $FP_IOS" \
  "https://$CF/ota/prod/global/ios/manifest.json"
```

On a device, the two-launch test:

1. Force-quit the app.
2. Launch #1 — shows the embedded bundle.
3. Wait ~20 seconds — OTA downloads in the background.
4. Force-quit again.
5. Launch #2 — shows the OTA-delivered bundle.

If launch #2 doesn't show the update, tail `adb logcat -v time | grep -iE 'expo|update|cloudfront'` (Android) or the Xcode Console filtered on `EXUpdates` (iOS).

---

## Design docs

- [`docs/bucket-layout.html`](docs/bucket-layout.html) — S3 subtree structure, fingerprint routing, versionCode monotonicity, rollback flow, retention rules
- [`docs/phase-1-plan.html`](docs/phase-1-plan.html) — rollout plan for the migration off the flat POC layout
- [`docs/poc-handoff.html`](docs/poc-handoff.html) — original POC handoff notes
