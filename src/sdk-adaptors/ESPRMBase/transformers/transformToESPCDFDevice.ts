/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDevice, ESPCDFDeviceParam } from "@store";
import { ESPRMDevice, ESPRMDeviceParam } from "@espressif/rainmaker-base-sdk";
import { HEADLESS_ERROR_UNKNOWN } from "@shared/utils/constants";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { makeCdfNodeParamsObservable } from "@sdk-adaptors/shared/utils/common";
import { transformToESPCDFDeviceParam } from "./transformToESPCDFDeviceParam";

/**
 * Transforms RM base device into CDF device with resilient param handling.
 * Malformed individual params are skipped so nodes still render when some params
 * are missing or invalid (all missing, device-only, service-only, or partial).
 * The node transform settles the shown name once the whole node is built.
 * @param device - Raw RM base device.
 * @returns CDF device with mapped params and operations.
 */
export function transformToESPCDFDevice(device: ESPRMDevice): ESPCDFDevice {
  const deviceLabel = device.name || device.type || "unknown-device";

  const mapDeviceParams = (rawParams: unknown) =>
    safeTransform<ESPRMDeviceParam, ESPCDFDeviceParam>(
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
      const freshParams = mapDeviceParams(latestParams ?? []);
      // The store swaps these in for the old params, so screens must see them change.
      makeCdfNodeParamsObservable({
        devices: [{ name: device.name, params: freshParams }],
      });
      return freshParams;
    },
  };

  return new ESPCDFDevice({
    name: device.name || "",
    type: device.type || "",
    params,
    displayName: device.displayName,
    attributes: device.attributes,
    operations: operations,
    _raw: device,
  });
}
