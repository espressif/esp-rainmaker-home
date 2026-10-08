/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Strips scheme and `/mqtt` suffix so callers can pass raw hosts or full WSS URLs.
 * @param endpoint - Broker endpoint from config
 * @returns Hostname only (no path)
 */
export function normalizeIotEndpointHost(endpoint: string): string {
  const trimmed = endpoint.trim();
  const withoutScheme = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^wss?:\/\//i, "");
  const withoutMqttPath = withoutScheme.replace(/\/mqtt\/?$/i, "");
  return withoutMqttPath.split("/")[0]?.trim() ?? "";
}
