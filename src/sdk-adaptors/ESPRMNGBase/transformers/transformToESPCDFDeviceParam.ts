import { ESPCDFDeviceParam } from "@store";
import { ESPRMNGDeviceParam } from "@espressif/rmng-base-sdk";

export function transformToESPCDFDeviceParam(
    param: ESPRMNGDeviceParam,
): ESPCDFDeviceParam {
    // Create ESPCDFDeviceParam entity instance
    const operations = {
        setValue: async (value: any) => {
            return param.setValue(value);
        },
    };
    return new ESPCDFDeviceParam({
        name: param.id || "",
        dataType: param.dataType || "string",
        type: param.type || "",
        value: param.value,
        properties: param.properties || ["read", "write"],
        uiType: param.uiType,
        bounds: param.bounds,
        deviceName: param.deviceId,
        operations: operations,
        _raw: param,
    });
}
