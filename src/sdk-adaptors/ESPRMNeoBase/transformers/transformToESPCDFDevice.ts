/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDevice, ESPCDFDeviceParam } from "@store";
import { ESPRMNeoDevice, ESPRMNeoDeviceParam } from "@espressif/rainmaker-neo-base-sdk";
import { HEADLESS_ERROR_UNKNOWN } from "@shared/utils/constants";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { transformToESPCDFDeviceParam } from "./transformToESPCDFDeviceParam";
import { resolveDeviceDisplayName } from "../utils/helpers/deviceHelpers";
import {
  ESPRMNEO_TRANSFORM_CONTEXT_DEVICE_PARAMS,
  ESPRMNEO_TRANSFORM_LOG_DEVICE_PARAM_SKIPPED,
  ESPRMNEO_TRANSFORM_UNKNOWN_DEVICE_LABEL,
} from "../utils/constants";
import { Logger } from "../utils/logger";

/** Optional inputs for device → CDF mapping. */
export interface TransformToESPCDFDeviceOptions {
  /** Parent node metadata used to resolve Matter device display names. */
  nodeMetadata?: Record<string, unknown>;
}

/**
 * Maps an RMNeo device to an `ESPCDFDevice`, skipping malformed params so the
 * node still renders when some params are missing or invalid.
 * @param device - Raw RMNeo device from the SDK.
 * @param options - Optional parent-node metadata for display-name resolution.
 * @returns CDF device with mapped params and a live `getParams` operation.
 */
export function transformToESPCDFDevice(
  device: ESPRMNeoDevice,
  options?: TransformToESPCDFDeviceOptions,
): ESPCDFDevice {
  const deviceLabel =
    device.name || device.type || ESPRMNEO_TRANSFORM_UNKNOWN_DEVICE_LABEL;

  /**
   * Maps a raw param list to CDF params, skipping nullish or failing entries.
   * @param rawParams - SDK param array (or unknown payload from `getParams`).
   * @returns Successfully transformed CDF device params.
   */
  const mapDeviceParams = (rawParams: unknown): ESPCDFDeviceParam[] =>
    safeTransform<ESPRMNeoDeviceParam, ESPCDFDeviceParam>(
      rawParams,
      ESPRMNEO_TRANSFORM_CONTEXT_DEVICE_PARAMS,
      (param) => transformToESPCDFDeviceParam(param),
      ({ index, error }) => {
        const message =
          error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
        Logger.warn(ESPRMNEO_TRANSFORM_LOG_DEVICE_PARAM_SKIPPED, {
          device: deviceLabel,
          index,
          reason: message,
        });
      },
      { skipElement: (param) => !param },
    );

  const params = mapDeviceParams(device.params);

  const operations = {
    /**
     * Pulls live param values via best transport (`cache: false`).
     * Default SDK cache would only re-read local node-config storage.
     * @returns Fresh CDF device params.
     */
    getParams: async (): Promise<ESPCDFDeviceParam[]> => {
      const latestParams = await device.getParams({ cache: false });
      return mapDeviceParams(latestParams ?? []);
    },
  };

  const displayName = resolveDeviceDisplayName(
    options?.nodeMetadata,
    device,
  );

  return new ESPCDFDevice({
    name: device.name || "",
    type: device.type || "",
    params,
    displayName,
    attributes: device.attributes,
    operations,
    _raw: device,
  });
}
