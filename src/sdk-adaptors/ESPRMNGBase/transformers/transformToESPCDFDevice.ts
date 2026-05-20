/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDevice, ESPCDFDeviceParam } from "@store";
import { ESPRMNGDevice, ESPRMNGDeviceParam } from "@espressif/rmng-base-sdk";
import { HEADLESS_ERROR_UNKNOWN } from "@shared/utils/constants";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { transformToESPCDFDeviceParam } from "./transformToESPCDFDeviceParam";
import { resolveDeviceDisplayName } from "../utils/device";

/**
 * Transforms RMNG base device into CDF device with resilient param handling.
 * Malformed individual params are skipped so nodes still render when some params
 * are missing or invalid (all missing, device-only, service-only, or partial).
 * @param device - Raw RMNG base device.
 * @param options - Optional node metadata used for display name resolution.
 * @returns CDF device with mapped params and operations.
 */
export function transformToESPCDFDevice(
  device: ESPRMNGDevice,
  options?: { nodeMetadata?: Record<string, unknown> },
): ESPCDFDevice {
  const deviceLabel = device.name || device.type || "unknown-device";

  const mapDeviceParams = (rawParams: unknown) =>
    safeTransform<ESPRMNGDeviceParam, ESPCDFDeviceParam>(
      rawParams,
      "device.params",
      (param) => transformToESPCDFDeviceParam(param),
      ({ index, error }) => {
        const message = error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
        console.warn("Device param transform skipped", {
          device: deviceLabel,
          index,
          reason: message,
        });
      },
      { skipElement: (param) => !param },
    );

  const params = mapDeviceParams(device.params);

  const operations = {
    getParams: async () => {
      const latestParams = await device.getParams();
      return mapDeviceParams(latestParams ?? []);
    },
  };

  const displayName = resolveDeviceDisplayName(options?.nodeMetadata, device, "");

  return new ESPCDFDevice({
    name: device.name || "",
    type: device.type || "",
    params,
    displayName,
    attributes: device.attributes,
    operations: operations,
    _raw: device,
  });
}
