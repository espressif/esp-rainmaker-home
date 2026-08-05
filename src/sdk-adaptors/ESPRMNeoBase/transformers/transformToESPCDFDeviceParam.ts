/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFDeviceParam,
  ESPCDFSimpleTSDataRequest,
  ESPCDFTSDataRequest,
} from "@store";
import { ESPRMNeoDeviceParam } from "@espressif/rainmaker-neo-base-sdk";
import {
  DATA_TYPE_STRING,
  ESPRM_PARAM_READ_PROPERTY,
  ESPRM_PARAM_WRITE_PROPERTY,
} from "@shared/utils/constants";

import {
  toCDFResponseFromNeoAggregates,
  toCDFResponseFromNeoRaw,
  toNeoAggregateOptions,
  toNeoRawOptions,
} from "../utils/helpers/deviceParamHelpers";

/** Default access properties when the SDK omits `properties` on a param. */
const ESPRMNEO_DEFAULT_PARAM_PROPERTIES = [
  ESPRM_PARAM_READ_PROPERTY,
  ESPRM_PARAM_WRITE_PROPERTY,
] as const;

/**
 * Maps an RMNeo device param to an `ESPCDFDeviceParam`, including live
 * operations for value writes and time-series reads.
 *
 * Time-series wiring (RMNeo has no client-picked aggregation and no
 * `simple_ts` endpoint):
 * - `getTSData` → aggregates endpoint (server-windowed stats)
 * - `getRawTSData` / `getSimpleTSData` → raw endpoint (`getSimpleTSData` is
 * CDF parity only)
 * @param param - Raw RMNeo device param from the SDK.
 * @returns CDF device param with mapped fields and bound operations.
 */
export function transformToESPCDFDeviceParam(
  param: ESPRMNeoDeviceParam,
): ESPCDFDeviceParam {
  const operations = {
    /**
     * Writes a new value to the param via the SDK.
     * @param value - Value to set on the device param.
     * @returns SDK write result.
     */
    setValue: async (value: unknown) => {
      return param.setValue(value);
    },

    /**
     * Fetches aggregated time-series via the RMNeo aggregates endpoint.
     * @param request - CDF aggregated TS request.
     * @returns CDF-shaped aggregates response.
     */
    getTSData: async (request: ESPCDFTSDataRequest) => {
      const result = await param.getTSData(toNeoAggregateOptions(request));
      return toCDFResponseFromNeoAggregates(result, request);
    },

    /**
     * Fetches raw time-series samples via the RMNeo raw endpoint.
     * @param request - CDF TS request (raw flavor).
     * @returns CDF-shaped raw TS response.
     */
    getRawTSData: async (request: ESPCDFTSDataRequest) => {
      const result = await param.getRawTSData(toNeoRawOptions(request));
      return toCDFResponseFromNeoRaw(result);
    },

    /**
     * CDF `simple_ts` parity: RMNeo has no simple-TS API, so this maps onto
     * the same raw endpoint as `getRawTSData`.
     * @param request - CDF simple-TS request.
     * @returns CDF-shaped raw TS response.
     */
    getSimpleTSData: async (request: ESPCDFSimpleTSDataRequest) => {
      const result = await param.getRawTSData(toNeoRawOptions(request));
      return toCDFResponseFromNeoRaw(result);
    },
  };

  return new ESPCDFDeviceParam({
    name: param.id || "",
    dataType: param.dataType || DATA_TYPE_STRING,
    type: param.type || "",
    value: param.value,
    properties: param.properties || [...ESPRMNEO_DEFAULT_PARAM_PROPERTIES],
    uiType: param.uiType,
    bounds: param.bounds,
    deviceName: param.deviceName,
    operations,
    _raw: param,
  });
}
