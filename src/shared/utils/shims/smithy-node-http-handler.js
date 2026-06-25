// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
//
// SPDX-License-Identifier: Apache-2.0

// React Native shim for `@smithy/node-http-handler`. The AWS SDK v3 CJS
// bundle unconditionally requires this module, which imports `node:https` /
// `node:http2` — unavailable in React Native. We redirect the module (via
// `metro.config.js` `resolveRequest`) to this file, which re-exports the
// fetch-based handler under the Node names. `FetchHttpHandler.create` has
// the same signature as `NodeHttpHandler.create`.

const { FetchHttpHandler, streamCollector } = require('@smithy/fetch-http-handler');

module.exports = {
  streamCollector,
  NodeHttpHandler: FetchHttpHandler,
  NodeHttp2Handler: FetchHttpHandler,
};
