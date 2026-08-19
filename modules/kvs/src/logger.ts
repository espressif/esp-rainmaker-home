/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared logger for `@modules/kvs`.
 *
 * - `debug` / `info` / `warn` — only when the host `__DEV__` flag is true
 * - `error` — always (dev and production)
 *
 * Avoids importing React Native types; reads `__DEV__` from `globalThis`.
 */

/** Logger surface shared by KVS services and transport. */
export interface KvsLogger {
  /** Verbose diagnostics; suppressed outside `__DEV__`. */
  debug: (...args: unknown[]) => void;
  /** Informational messages; suppressed outside `__DEV__`. */
  info: (...args: unknown[]) => void;
  /** Non-fatal warnings; suppressed outside `__DEV__`. */
  warn: (...args: unknown[]) => void;
  /** Failures; logged in all environments. */
  error: (...args: unknown[]) => void;
}

/**
 * Returns whether the RN/host `__DEV__` flag is enabled.
 * @returns `true` when `__DEV__` is explicitly `true` on `globalThis`.
 */
function isDev(): boolean {
  return (
    typeof (globalThis as { __DEV__?: boolean }).__DEV__ === "boolean" &&
    (globalThis as { __DEV__?: boolean }).__DEV__ === true
  );
}

/**
 * Builds a scoped logger that prefixes every line with `[scope]`.
 * @param scope - Short label (e.g. `KvsSignalingClient`, `KVS`).
 * @returns Logger with env-gated levels.
 */
export function createKvsLogger(scope: string): KvsLogger {
  const prefix = `[${scope}]`;

  return {
    debug: (...args: unknown[]) => {
      if (isDev()) {
        console.debug(prefix, ...args);
      }
    },
    info: (...args: unknown[]) => {
      if (isDev()) {
        console.info(prefix, ...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (isDev()) {
        console.warn(prefix, ...args);
      }
    },
    error: (...args: unknown[]) => {
      console.error(prefix, ...args);
    },
  };
}

/**
 * Returns a log-safe URL string with the query stripped (avoids leaking SigV4
 * tokens / signatures). Falls back to a generic label if parsing fails.
 * @param url - Full URL that may contain signed query parameters.
 * @returns `protocol//host/path` only, or `"invalid-url"`.
 */
export function redactUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname || "/"}`;
  } catch {
    return "invalid-url";
  }
}

/** Default module-scoped logger for general KVS code. */
export const kvsLogger = createKvsLogger("KVS");
