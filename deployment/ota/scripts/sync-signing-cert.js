#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Sync the OTA signing certificate PEM into the two hand-maintained native
 * files that bake it into the app binary:
 *   - ios/APP/Supporting/Expo.plist            EXUpdatesCodeSigningCertificate
 *   - android/app/src/main/AndroidManifest.xml CODE_SIGNING_CERTIFICATE
 *
 * Source of truth: deployment/ota/certs/certificate.pem. The client verifies OTA
 * manifest signatures against the baked-in cert; drift here means signed
 * manifests get rejected and no updates apply. CI runs --check to catch it.
 *
 * We don't use `expo-updates configuration:syncnative`; it would also
 * overwrite the OTA URL and runtime-version fields, which are maintained
 * out of band. See deployment/ota/README.md for the rotation procedure.
 *
 * Usage:
 *   node deployment/ota/scripts/sync-signing-cert.js                       # patch drift on both platforms
 *   node deployment/ota/scripts/sync-signing-cert.js --check               # exit 1 if drift (for CI)
 *   node deployment/ota/scripts/sync-signing-cert.js --platform ios        # limit to one platform
 */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  parseFlagArgs,
  printOwnHelp,
  readNativeField,
  patchNativeField,
} = require("./_lib");

const CERT_PATH = path.join(ROOT, "deployment", "ota", "certs", "certificate.pem");

// Per-platform: file + regex for the cert value + optional encode/decode
// hooks to translate between the source PEM (raw \n) and the on-disk
// representation. iOS Expo.plist stores raw multi-line strings. Android's
// manifest merger rejects literal newlines inside android:value="…" attributes,
// so the Android target encodes newlines as `&#10;` XML entities on write and
// decodes them on read.
const TARGETS = {
  ios: {
    file: "ios/APP/Supporting/Expo.plist",
    // PEM spans multiple lines — [\s\S] and non-greedy so we don't
    // accidentally swallow the next key.
    reKey: /(<key>EXUpdatesCodeSigningCertificate<\/key>\s*<string>)([\s\S]*?)(<\/string>)/,
    fieldName: "code-signing certificate",
  },
  android: {
    file: "android/app/src/main/AndroidManifest.xml",
    reKey:
      /(android:name="expo\.modules\.updates\.CODE_SIGNING_CERTIFICATE"[\s\S]*?android:value=")([\s\S]*?)(")/,
    encode: (pem) => pem.replace(/\n/g, "&#10;"),
    decode: (attr) => attr.replace(/&#10;/g, "\n"),
    fieldName: "code-signing certificate",
  },
};

function readSourceCert() {
  if (!fs.existsSync(CERT_PATH)) {
    throw new Error(
      `Signing certificate not found at ${CERT_PATH}. Generate one with \`npx expo-updates codesigning:generate\` or restore from your secret store.`
    );
  }
  return fs.readFileSync(CERT_PATH, "utf-8").trim();
}

function main() {
  const { check, platform } = parseFlagArgs(process.argv, {
    flags: ["check"],
    options: ["platform"],
    onHelp: () => printOwnHelp(__filename),
  });

  const platforms = platform ? [platform] : Object.keys(TARGETS);
  for (const p of platforms) {
    if (!TARGETS[p]) {
      console.error(`Unknown platform "${p}". Use "ios" or "android".`);
      process.exit(1);
    }
  }

  const expected = readSourceCert();
  let drift = false;
  for (const p of platforms) {
    const { current } = readNativeField(TARGETS[p]);
    if (current === expected) {
      console.log(`✓ ${p}: certificate in sync`);
      continue;
    }
    if (check) {
      console.error(
        `✗ ${p}: drift — ${TARGETS[p].file} has a different cert than ${path.relative(ROOT, CERT_PATH)}. ` +
          `Run \`node deployment/ota/scripts/sync-signing-cert.js --platform ${p}\` and commit the change.`
      );
      drift = true;
      continue;
    }
    patchNativeField(TARGETS[p], expected);
    console.log(`✓ ${p}: certificate updated`);
  }
  if (drift) process.exit(1);
}

if (require.main === module) main();

module.exports = { readSourceCert, TARGETS };
