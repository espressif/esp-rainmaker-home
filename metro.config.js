// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
//
// SPDX-License-Identifier: Apache-2.0

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Local modules (e.g. @modules/kvs) live outside node_modules source tree;
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

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
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
