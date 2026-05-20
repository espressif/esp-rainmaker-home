/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFServiceParam } from "@store";
import { ESPRMServiceParam } from "@espressif/rainmaker-base-sdk";

export function transformToESPCDFServiceParam(
    param: ESPRMServiceParam,
): ESPCDFServiceParam {
    const operations = {
        setValue: async (value: any) => {
            return param.setValue(value);
        },
    };
    return new ESPCDFServiceParam({
        name: param.name || "",
        dataType: param.dataType || "string",
        type: param.type || "",
        value: param.value,
        properties: Array.isArray( param.properties) ?  param.properties : [],
        bounds: param.bounds,
        serviceName: (param as any).serviceName, // Preserve serviceName
        operations: operations,
        _raw: param,
    });
}
