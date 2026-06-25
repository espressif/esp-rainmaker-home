// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
//
// SPDX-License-Identifier: Apache-2.0

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// MQTT.js: resolve package "exports" so React Native gets dist/mqtt.esm.js
// (Node build pulls `url` and other stdlib). Required for Expo SDK ≤ 53.
config.resolver.unstable_enablePackageExports = true;

// AWS SDK v3 (used by @aws-sdk/client-kinesis-video*): the CJS build
// unconditionally requires `@smithy/node-http-handler` (which imports
// `node:https`/`node:http2`) and the full credential-provider chain (which
// imports `node:fs`, `node:crypto`, `node:child_process`, etc.). The app
// passes in-memory AWS credentials directly, so the credential-provider paths
// never execute — the `node:*` requires just need to resolve at bundle time.
const smithyNodeHttpHandlerShim = path.resolve(
  __dirname,
  'src/shared/utils/shims/smithy-node-http-handler.js',
);
const nodeBuiltinShim = path.resolve(
  __dirname,
  'src/shared/utils/shims/node-builtin.js',
);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@smithy/node-http-handler') {
    return { type: 'sourceFile', filePath: smithyNodeHttpHandlerShim };
  }
  if (moduleName.startsWith('node:')) {
    return { type: 'sourceFile', filePath: nodeBuiltinShim };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
