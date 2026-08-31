#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Sync expo-updates runtimeVersion (fingerprint hash) into the hand-maintained
 * native config files. Under app.config.ts's `runtimeVersion: { policy:
 * "fingerprint" }`, the hash is derived by @expo/fingerprint; this script
 * mirrors it into Expo.plist and AndroidManifest.xml where the client reads
 * it. Drift silently breaks OTA delivery — CI runs --check to catch it.
 *
 * We don't use `expo-updates configuration:syncnative`; that command also
 * overwrites the OTA URL fields, which are maintained out of band.
 *
 * Usage:
 *   node deployment/ota/scripts/sync-runtime-version.js                          # patch drift on both platforms
 *   node deployment/ota/scripts/sync-runtime-version.js --check                  # exit 1 if drift (for CI)
 *   node deployment/ota/scripts/sync-runtime-version.js --platform ios           # limit to one platform
 *   node deployment/ota/scripts/sync-runtime-version.js --print --platform ios   # stdout: just the hash
 *
 * Run `npm ci` first if node_modules has drifted from package-lock.json —
 * the fingerprint reads autolinking config from node_modules, so a stale
 * install produces a different hash than CI computes on its fresh checkout.
 */

const { spawnSync } = require("child_process");
const {
  ROOT,
  parseFlagArgs,
  printOwnHelp,
  readNativeField,
  patchNativeField,
} = require("./_lib");

// Per-platform: file to patch, plus a regex anchored on the key so we can't
// accidentally overwrite a neighbouring value like the OTA URL.
const TARGETS = {
  ios: {
    file: "ios/APP/Supporting/Expo.plist",
    reKey: /(<key>EXUpdatesRuntimeVersion<\/key>\s*<string>)([^<]*)(<\/string>)/,
    fieldName: "runtime-version key",
  },
  android: {
    file: "android/app/src/main/AndroidManifest.xml",
    reKey: /(android:name="expo\.modules\.updates\.EXPO_RUNTIME_VERSION"[\s\S]*?android:value=")([^"]*)(")/,
    fieldName: "runtime-version key",
  },
};

/**
 * Ask expo-updates to resolve runtimeVersion. Under fingerprint policy this
 * returns the SHA-1 hash of the native surface.
 */
function resolveRuntimeVersion(platform) {
  const result = spawnSync(
    "npx",
    ["expo-updates", "runtimeversion:resolve", "--platform", platform],
    { cwd: ROOT, encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error(
      `runtimeversion:resolve failed for ${platform}\n${result.stderr || result.stdout}`
    );
  }
  const parsed = JSON.parse(result.stdout);
  if (!parsed.runtimeVersion) {
    throw new Error(
      `runtimeversion:resolve for ${platform} returned no runtimeVersion: ${result.stdout}`
    );
  }
  return parsed.runtimeVersion;
}

function main() {
  const { check, print, platform } = parseFlagArgs(process.argv, {
    flags: ["check", "print"],
    options: ["platform"],
    onHelp: () => printOwnHelp(__filename),
  });

  if (print) {
    if (!platform || !TARGETS[platform]) {
      console.error(`--print requires --platform ios|android`);
      process.exit(1);
    }
    process.stdout.write(resolveRuntimeVersion(platform));
    return;
  }

  const platforms = platform ? [platform] : Object.keys(TARGETS);
  for (const p of platforms) {
    if (!TARGETS[p]) {
      console.error(`Unknown platform "${p}". Use "ios" or "android".`);
      process.exit(1);
    }
  }

  let drift = false;
  for (const p of platforms) {
    const expected = resolveRuntimeVersion(p);
    const { current } = readNativeField(TARGETS[p]);
    if (current === expected) {
      console.log(`✓ ${p}: ${expected} (up to date)`);
      continue;
    }
    if (check) {
      console.error(
        `✗ ${p}: drift — ${TARGETS[p].file} has "${current}", fingerprint resolves to "${expected}". ` +
          `Run \`node deployment/ota/scripts/sync-runtime-version.js --platform ${p}\` and commit the change.`
      );
      drift = true;
      continue;
    }
    patchNativeField(TARGETS[p], expected);
    console.log(`✓ ${p}: ${current} → ${expected}`);
  }
  if (drift) process.exit(1);
}

if (require.main === module) main();

module.exports = { resolveRuntimeVersion, TARGETS };
