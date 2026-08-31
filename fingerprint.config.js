// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0

// @expo/fingerprint configuration — derives the runtime-version hash for
// expo-updates under the "fingerprint" policy declared in app.config.ts.

// Strip the resolved runtime-version field from the native config files
// before hashing. Otherwise writing the fingerprint back into these files
// (via deployment/ota/scripts/sync-runtime-version.js) would perturb the hash that
// produced it — a self-referential loop.
const RUNTIME_VERSION_STRIPPERS = {
  'ios/APP/Supporting/Expo.plist': (buf) =>
    buf.replace(
      /(<key>EXUpdatesRuntimeVersion<\/key>\s*<string>)[^<]*(<\/string>)/,
      '$1RUNTIME_VERSION_ELIDED_FOR_FINGERPRINT$2'
    ),
  'android/app/src/main/AndroidManifest.xml': (buf) =>
    buf.replace(
      /(android:name="expo\.modules\.updates\.EXPO_RUNTIME_VERSION"[\s\S]*?android:value=")[^"]*(")/,
      '$1RUNTIME_VERSION_ELIDED_FOR_FINGERPRINT$2'
    ),
};

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  // Excluded so the fingerprint stays stable across dev machines and CI.
  // Everything here is either gitignored per-machine or Xcode-generated
  // state absent in a fresh checkout. Trade-off: google-services.json is
  // technically part of the native ABI but is excluded because CI doesn't
  // decode the Firebase secret; Firebase config changes are coordinated
  // with app releases anyway.
  ignorePaths: [
    '**/android/local.properties',
    '**/android/keystore.properties',
    '**/android/app/release.*.keystore',
    '**/android/app/google-services.json',
    '**/android/app/sign/**/*',
    '**/android/.idea/**/*',
    '**/ios/Podfile.lock',
    '**/ios/.xcode.env.updates',
    // The library's default `**/ios/**/project.xcworkspace` pattern matches
    // only the directory node, not files inside — cover both explicitly.
    '**/ios/**/project.xcworkspace/**/*',
    '**/ios/**/xcuserdata/**/*',
    // Build artifacts under any nested `android/` or `ios/` — including
    // `node_modules/*/android/build/` — from local `./gradlew` or Xcode runs.
    // Not part of the shipped surface; CI's fresh checkout never has them.
    // Without these ignores, dev machines that built locally get a different
    // fingerprint from CI even with identical committed sources.
    '**/android/build/**',
    '**/android/.gradle/**',
    '**/android/.cxx/**',
    '**/android/app/build/**',
    '**/ios/build/**',
    '**/ios/DerivedData/**',
  ],

  // Native config files here are small (<10 KB) and always arrive in one
  // stream chunk, so single-pass replace is safe.
  //
  // Two call shapes from @expo/fingerprint to distinguish:
  //   - type: 'file'     — streamed: transform each chunk; the final flush
  //                        passes chunk=null so returning null there means
  //                        "no more chunks to push".
  //   - type: 'contents' — one-shot: called once with chunk=<full body> and
  //                        isEndOfFile=true; the return value is used as the
  //                        source contents (null → blanked to '').
  //
  // The prior implementation returned null on any isEndOfFile call, which
  // silently blanked every contents source (expoConfig, package.json scripts,
  // both autolinking configs) so legitimate config changes stopped bumping
  // the fingerprint.
  fileHookTransform(source, chunk, isEndOfFile) {
    const strip = source.type === 'file' && RUNTIME_VERSION_STRIPPERS[source.filePath];
    if (!strip) {
      return chunk;
    }
    if (chunk == null) return null;
    return strip(chunk.toString('utf-8'));
  },

  sourceSkips: [
    // Drop the `extra` block from the hashed expoConfig. `extra.commitId`
    // changes on every commit (populated from CI_COMMIT_SHORT_SHA), and the
    // JS-only feature flags and regionConfigs under `extra.*` don't affect
    // native ABI — anything that does is already captured by the native
    // file hashes.
    'ExpoConfigExtraSection',

    // Guard against accidental regression from `{ policy: "fingerprint" }`
    // back to a plain-string runtimeVersion in app.config.ts.
    'ExpoConfigRuntimeVersionIfString',

    // Library default — kept explicit. Prebuild rewrites some package.json
    // script entries; ignoring them keeps the hash consistent across prebuild.
    'PackageJsonAndroidAndIosScriptsIfNotContainRun',

    // `.gitignore` content doesn't affect native ABI. Pattern changes that
    // add/remove native files are still caught by the tree walker.
    'GitIgnore',
  ],
};
