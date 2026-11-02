/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Thrown by an SDK adaptor when the app cannot run safely without the part
 * that failed. App start stops and the start screen offers Retry; any other
 * start-up error is logged and the app carries on.
 */
export class StartupError extends Error {
  /** The original failure, for logs. */
  readonly reason: unknown;

  /**
   * @param message - What could not be set up.
   * @param reason - The original failure.
   */
  constructor(message: string, reason?: unknown) {
    super(message);
    this.name = "StartupError";
    this.reason = reason;
  }
}
