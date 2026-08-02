/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDeviceParam, ESPCDFSimpleTSDataRequest, ESPCDFTSDataRequest } from "@store";
import { ESPRMDeviceParam, ESPRawTSDataRequest, ESPTSDataRequest } from "@espressif/rainmaker-base-sdk";

import {
    ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY,
    ESPRM_PARAM_TIME_SERIES_PROPERTY,
} from "../constants";
import {
    toCDFResponseFromRMAggregates,
    toRMAggregatesRequest,
} from "../utils/timeSeriesMapper";

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
            // `time_series` params keep the classic endpoint — it honors the
            // request's timezone/weekStart, which the fixed server windows of
            // the aggregates endpoint cannot. The aggregates path serves
            // simple_ts-only params, whose endpoint cannot aggregate.
            const properties = param.properties ?? [];
            if (
                !properties.includes(ESPRM_PARAM_TIME_SERIES_PROPERTY) &&
                properties.includes(ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY) &&
                request.aggregationInterval
            ) {
                const response = await param.getSimpleTSDataAggregates(
                    toRMAggregatesRequest(request),
                );
                return toCDFResponseFromRMAggregates(response, request);
            }
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
