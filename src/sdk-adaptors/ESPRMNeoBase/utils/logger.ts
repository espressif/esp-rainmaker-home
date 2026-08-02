/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNEO_LOG_LEVEL,
  ESPRMNEO_LOGGER_DEFAULT_PREFIX,
  type ESPRMNeoLogLevel,
} from "./constants";

const LOG_LEVEL_PRIORITY: Record<ESPRMNeoLogLevel, number> = {
  [ESPRMNEO_LOG_LEVEL.LOG]: 0,
  [ESPRMNEO_LOG_LEVEL.INFO]: 1,
  [ESPRMNEO_LOG_LEVEL.WARN]: 2,
  [ESPRMNEO_LOG_LEVEL.ERROR]: 3,
};

/**
 * Prefixed console logger for the RMNeoBase SDK adaptor.
 * Emits only levels at or above the configured minimum.
 */
export class ESPRMNeoLogger {
  private readonly prefix: string;
  private minLevel: ESPRMNeoLogLevel;

  /**
   * @param prefix - Bracketed tag prepended to every log line.
   * @param minLevel - Lowest level that will be printed (default: log).
   */
  constructor(
    prefix: string = ESPRMNEO_LOGGER_DEFAULT_PREFIX,
    minLevel: ESPRMNeoLogLevel = ESPRMNEO_LOG_LEVEL.LOG
  ) {
    this.prefix = prefix;
    this.minLevel = minLevel;
  }

  /**
   * Raises or lowers the minimum level that will be printed.
   * @param level - New minimum log level.
   */
  setMinLevel(level: ESPRMNeoLogLevel): void {
    this.minLevel = level;
  }

  /**
   * Logs at the `log` level with the configured prefix.
   * @param args - Values forwarded to `console.log`.
   */
  log(...args: unknown[]): void {
    this.write(ESPRMNEO_LOG_LEVEL.LOG, args);
  }

  /**
   * Logs at the `info` level with the configured prefix.
   * @param args - Values forwarded to `console.info`.
   */
  info(...args: unknown[]): void {
    this.write(ESPRMNEO_LOG_LEVEL.INFO, args);
  }

  /**
   * Logs at the `warn` level with the configured prefix.
   * @param args - Values forwarded to `console.warn`.
   */
  warn(...args: unknown[]): void {
    this.write(ESPRMNEO_LOG_LEVEL.WARN, args);
  }

  /**
   * Logs at the `error` level with the configured prefix.
   * @param args - Values forwarded to `console.error`.
   */
  error(...args: unknown[]): void {
    this.write(ESPRMNEO_LOG_LEVEL.ERROR, args);
  }

  /**
   * Writes to the matching console method when `level` meets the minimum.
   * @param level - Target console log level.
   * @param args - Values to print after the prefix.
   */
  private write(level: ESPRMNeoLogLevel, args: unknown[]): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }
    console[level](this.prefix, ...args);
  }
}

/** Shared adaptor logger with the default `[ESPRMNeoBaseSDKAdaptor]` prefix. */
export const Logger = new ESPRMNeoLogger();
