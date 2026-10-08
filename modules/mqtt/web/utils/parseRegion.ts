/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parses an AWS region id from a standard IoT Core hostname
 * (`*.iot.<region>.*` or `*.iot-<variant>.<region>.*`).
 * @param host - Normalized IoT hostname
 * @returns Region id or `undefined` when the host does not embed a region
 */
export function parseRegionIdFromIotHost(host: string): string | undefined {
  const parts = host.split(".");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "iot" && i + 1 < parts.length) {
      return parts[i + 1];
    }
    if (part.startsWith("iot-") && part !== "iot" && i + 1 < parts.length) {
      return parts[i + 1];
    }
  }
  return undefined;
}

/**
 * Resolves the AWS region used for SigV4: explicit config override, else host parse.
 * @param host - Normalized IoT hostname
 * @param regionOverride - Optional region from config
 * @returns Region id
 * @throws When neither override nor host yields a region
 */
export function resolveAwsRegion(
  host: string,
  regionOverride?: string,
): string {
  const fromConfig = regionOverride?.trim();
  if (fromConfig) {
    return fromConfig;
  }
  const fromHost = parseRegionIdFromIotHost(host);
  if (fromHost) {
    return fromHost;
  }
  throw new Error(
    "Could not determine AWS region: pass config.region (e.g. us-east-1) or use a standard IoT endpoint host (*.iot.<region>.amazonaws.com).",
  );
}
