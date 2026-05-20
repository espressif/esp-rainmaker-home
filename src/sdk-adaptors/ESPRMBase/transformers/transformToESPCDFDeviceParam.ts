/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDeviceParam, ESPCDFSimpleTSDataRequest, ESPCDFTSDataRequest } from "@store";
import { ESPRMDeviceParam, ESPRawTSDataRequest, ESPTSDataRequest } from "@espressif/rainmaker-base-sdk";

export function transformToESPCDFDeviceParam(
    param: ESPRMDeviceParam,
): ESPCDFDeviceParam {
    const operations = {
        setValue: async (value: any) => {
            return param.setValue(value);
        },
        getSimpleTSData: async (request: ESPCDFSimpleTSDataRequest) => {
            return param.getSimpleTSData(request);
        },
        getRawTSData: async (request: ESPCDFTSDataRequest) => {
            return param.getRawTSData(request as ESPRawTSDataRequest);
        },
        getTSData: async (request: ESPCDFTSDataRequest) => {
            return param.getTSData(request as ESPTSDataRequest);
        },
    };
    return new ESPCDFDeviceParam({
        name: param.name || "",
        dataType: param.dataType || "string",
        type: param.type || "",
        value: param.value,
        properties: Array.isArray( param.properties) ?  param.properties : [],
        uiType: param.uiType,
        bounds: param.bounds,
        deviceName: (param as any).deviceName, // Preserve deviceName
        operations: operations,
        _raw: param,
    });
}
