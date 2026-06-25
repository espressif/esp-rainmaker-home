// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
//
// SPDX-License-Identifier: Apache-2.0

// React Native stub for Node.js built-in modules (`node:fs`, `node:crypto`,
// `node:child_process`, etc.). The AWS SDK v3 CJS bundle pulls in the entire
// credential-provider chain via `require("@aws-sdk/credential-provider-node")`,
// which top-level-requires these Node built-ins. The app never exercises the
// file/env/sso/imds credential paths at runtime (it passes in-memory
// `credentials` directly to each client), so these imports only need to
// resolve at bundle time.
//
// The Proxy returns a no-op function for every property access, so any
// destructured symbol (`readFileSync`, `homedir`, `promisify`, ...) is
// callable. If a code path actually invokes one, it throws a clear error
// rather than silently returning undefined.

const noop = new Proxy(
  function () {
    throw new Error(
      'Node.js built-in shim invoked in React Native. This code path is not supported on-device.',
    );
  },
  {
    get: (target, prop) => {
      if (prop === 'then') return undefined;
      return noop;
    },
  },
);

module.exports = noop;
