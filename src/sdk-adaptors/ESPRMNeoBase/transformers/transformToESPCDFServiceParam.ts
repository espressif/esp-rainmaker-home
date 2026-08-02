/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFServiceParam, ESPCDFServiceParamOperation } from "@store";
import { ESPRMNeoServiceParam } from "@espressif/rainmaker-neo-base-sdk";
import {
  DATA_TYPE_STRING,
  ESPRM_PARAM_READ_PROPERTY,
  ESPRM_PARAM_WRITE_PROPERTY,
} from "@shared/utils/constants";

/** Default access properties when the SDK omits `properties` on a param. */
const ESPRMNEO_DEFAULT_PARAM_PROPERTIES = [
  ESPRM_PARAM_READ_PROPERTY,
  ESPRM_PARAM_WRITE_PROPERTY,
] as const;

/**
 * Maps an RMNeo service param to an `ESPCDFServiceParam`, binding a live
 * `setValue` operation for value writes.
 * @param param - Raw RMNeo service param from the SDK.
 * @returns CDF service param with mapped fields and bound operations.
 */
export function transformToESPCDFServiceParam(
  param: ESPRMNeoServiceParam,
): ESPCDFServiceParam {
  const operations: ESPCDFServiceParamOperation = {
    /**
     * Writes a new value to the service param via the SDK.
     * @param value - Value to set on the service param.
     * @returns SDK write result.
     */
    setValue: async (value: unknown) => {
      return param.setValue(value);
    },
  };
  return new ESPCDFServiceParam({
    name: param.id || "",
    dataType: param.dataType || DATA_TYPE_STRING,
    type: param.type || "",
    value: param.value,
    properties: param.properties || [...ESPRMNEO_DEFAULT_PARAM_PROPERTIES],
    bounds: param.bounds,
    serviceName: param.serviceName,
    operations: operations,
    _raw: param,
  });
}
