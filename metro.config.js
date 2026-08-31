// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
//
// SPDX-License-Identifier: Apache-2.0

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Local modules (e.g. @modules/kvs, @modules/webrtc) live outside node_modules;
// watch them so Metro picks up edits without a full restart.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, 'modules'),
];

// npm workspaces (`modules/*`): resolve peers/deps from the app root so
// nested workspace installs do not pull duplicate React / AWS copies.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

/** Browser WebRTC shim — replaces native `react-native-webrtc` on web only. */
const WEB_WEBRTC_ENTRY = path.resolve(
  __dirname,
  'modules/webrtc/web/index.ts',
);


// MQTT.js: resolve package "exports" so React Native gets dist/mqtt.esm.js
// (Node build pulls `url` and other stdlib). Required for Expo SDK ≤ 53.
config.resolver.unstable_enablePackageExports = true;

// AWS SDK clients (@aws-sdk/client-*) have no "exports" field, so Metro picks
// their CJS `main` (dist-cjs) build, which hard-codes NodeHttpHandler and pulls
// Node-only `node:https`/`node:http2` — breaking the release bundle. Force their
// ESM (dist-es) entry instead: it honors each package's `react-native` field,
// remapping runtimeConfig -> runtimeConfig.native (RN-safe FetchHttpHandler).
const awsEsmEntryCache = new Map();
const resolveAwsEsmEntry = (moduleName) => {
  if (awsEsmEntryCache.has(moduleName)) {
    return awsEsmEntryCache.get(moduleName);
  }
  let entry = null;
  if (/^@aws-sdk\/client-[^/]+$/.test(moduleName)) {
    try {
      entry = require.resolve(`${moduleName}/dist-es/index.js`);
    } catch {
      entry = null; // package has no ESM build; leave default resolution
    }
  }
  awsEsmEntryCache.set(moduleName, entry);
  return entry;
};

/**
 * Forces browser builds of AWS IoT / CRT when bundling for web.
 * Their `main` entries pull native Node bindings that break Expo web.
 * @param moduleName - Requested module id
 * @param platform - Metro platform (`web`, `ios`, …)
 * @returns Absolute browser entry path, or null
 */
const resolveAwsIotBrowserEntry = (moduleName, platform) => {
  if (platform !== 'web') {
    return null;
  }
  if (moduleName === 'aws-iot-device-sdk-v2') {
    try {
      return require.resolve('aws-iot-device-sdk-v2/dist/browser.js');
    } catch {
      return null;
    }
  }
  if (moduleName === 'aws-crt') {
    try {
      return require.resolve('aws-crt/dist.browser/browser.js');
    } catch {
      return null;
    }
  }
  return null;
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    (moduleName === 'react-native-webrtc' ||
      moduleName.startsWith('react-native-webrtc/'))
  ) {
    return { type: 'sourceFile', filePath: WEB_WEBRTC_ENTRY };
  }
  const browserEntry = resolveAwsIotBrowserEntry(moduleName, platform);
  if (browserEntry) {
    return { type: 'sourceFile', filePath: browserEntry };
  }
  const esmEntry = resolveAwsEsmEntry(moduleName);
  if (esmEntry) {
    return { type: 'sourceFile', filePath: esmEntry };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = config;
