/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDevice, ESPCDFDeviceParam } from "@store";
import {
    writeHybridMatterParam,
    type HybridMatterParamWriteContext,
} from "../utils/hybridMatterParamWrite";
import {
    matterDeviceTypeSupportsLevel,
} from "../bridge/utils/rmngMatterEndpointDt";
import {
    coerceDecodedRmngMatterParamValue,
    decodeRmngMatterParamForCdf,
} from "../utils/decodeRmngMatterParamForCdf";
import { matterEndpointInternalDeviceName } from "../utils/rmngMatterShadowParams";

const ON_OFF = "0x6";
const LEVEL = "0x8";
const COLOR = "0x300";
const ATTR_ON_OFF = "0x0";
const ATTR_CURRENT_LEVEL = "0x0";
const ATTR_CURRENT_HUE = "0x0";
const ATTR_CURRENT_SATURATION = "0x1";
const ATTR_COLOR_TEMP_MIREDS = "0x7";

const DEFAULT_DEVICE_NAME = "Light";

type MatterPath = {
    endpoint: string;
    role: string;
    cluster: string;
    type: string;
    attr: string;
};

function getAttrVal(obj: unknown): number | boolean | undefined {
    if (obj === undefined || obj === null) return undefined;
    if (typeof obj === "object" && obj !== null && "value" in obj) {
        return (obj as { value: unknown }).value as number | boolean;
    }
    if (typeof obj === "number" || typeof obj === "boolean") return obj;
    return undefined;
}

/** RMNG compressed `c.s` or expanded `clusters.servers` for one endpoint. */
function getEndpointServerClusters(
    epData: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (!epData) return undefined;
    const compressed = (epData as { c?: { s?: Record<string, unknown> } }).c?.s;
    if (compressed && typeof compressed === "object") return compressed;
    const expanded = (epData as { clusters?: { servers?: Record<string, unknown> } })
        .clusters?.servers;
    return expanded && typeof expanded === "object" ? expanded : undefined;
}

/** Cluster presence by key — same rule as SDK `buildDevicesFromEndpoints` / `clusterIdsFromRecord`. */
function serverClustersInclude(
    servers: Record<string, unknown> | undefined,
    clusterId: string,
): boolean {
    return !!servers && clusterId in servers;
}

function serversSupportPowerControl(servers: Record<string, unknown> | undefined): boolean {
    return serverClustersInclude(servers, ON_OFF);
}

function serversSupportLevelControl(servers: Record<string, unknown> | undefined): boolean {
    return serverClustersInclude(servers, LEVEL);
}

function serversSupportColorControl(servers: Record<string, unknown> | undefined): boolean {
    if (!serverClustersInclude(servers, COLOR)) return false;
    return (
        serverAdvertisesAttr(servers, COLOR, ATTR_CURRENT_HUE) ||
        serverAdvertisesAttr(servers, COLOR, ATTR_CURRENT_SATURATION) ||
        serverAdvertisesAttr(servers, COLOR, ATTR_COLOR_TEMP_MIREDS)
    );
}

function endpointsAdvertiseColorAttr(
    endpoints: Record<string, Record<string, unknown>> | undefined,
    attrId: string,
): boolean {
    if (!endpoints) return false;
    return Object.values(endpoints).some((ep) =>
        serverAdvertisesAttr(getEndpointServerClusters(ep), COLOR, attrId),
    );
}

function endpointsExposeLightCapabilities(
    endpoints?: Record<string, Record<string, unknown>>,
): boolean {
    if (!endpoints) return false;
    return Object.values(endpoints).some((ep) => {
        const servers = getEndpointServerClusters(ep);
        return serversSupportLevelControl(servers) || serversSupportColorControl(servers);
    });
}

function collectOnOffServerEndpointIds(
    endpoints?: Record<string, Record<string, unknown>>,
): string[] {
    if (!endpoints) return [];
    const ids: string[] = [];
    for (const [epId, epData] of Object.entries(endpoints)) {
        const servers = getEndpointServerClusters(epData);
        if (serversSupportPowerControl(servers)) ids.push(epId);
    }
    ids.sort((a, b) => {
        const na = parseInt(a.replace(/^0x/i, ""), 16);
        const nb = parseInt(b.replace(/^0x/i, ""), 16);
        return na - nb;
    });
    return ids;
}

function findEndpointWithServerCluster(
    endpoints: Record<string, Record<string, unknown>> | undefined,
    clusterId: string,
): string | undefined {
    if (!endpoints) return undefined;
    for (const [epId, epData] of Object.entries(endpoints)) {
        const servers = getEndpointServerClusters(epData);
        if (servers && clusterId in servers) return epId;
    }
    return undefined;
}

function getServerAttr(
    servers: Record<string, unknown> | undefined,
    clusterId: string,
    attrId: string,
): unknown {
    const cluster = servers?.[clusterId] as Record<string, unknown> | undefined;
    const attrs = (cluster?.a ?? cluster?.attributes) as
        | Record<string, unknown>
        | undefined;
    return attrs?.[attrId];
}

/** True when the endpoint advertises a Color Control attribute (config key or value). */
function serverAdvertisesAttr(
    servers: Record<string, unknown> | undefined,
    clusterId: string,
    attrId: string,
): boolean {
    return getServerAttr(servers, clusterId, attrId) !== undefined;
}

function decodeUiParamValue(paramName: string, raw: unknown): unknown {
    if (raw === undefined) return undefined;
    return coerceDecodedRmngMatterParamValue(decodeRmngMatterParamForCdf(paramName, raw));
}

function makeParam(
    name: string,
    type: string,
    dataType: string,
    value: unknown,
    matterPath: MatterPath,
    writeContext?: HybridMatterParamWriteContext,
    bounds?: { min: number; max: number },
): ESPCDFDeviceParam {
    return new ESPCDFDeviceParam({
        name,
        type,
        dataType,
        value,
        bounds,
        properties: ["read", "write"],
        operations: {
            setValue: writeContext
                ? async (nextValue: unknown) => {
                      await writeHybridMatterParam({
                          ...writeContext,
                          paramName: name,
                          value: nextValue,
                          matterPath,
                      });
                  }
                : async () => {},
        },
        _raw: { _matterPath: matterPath },
    });
}

/**
 * Builds CDF devices from RMNG+Matter merged config+params (`c/s/a` endpoints).
 */
export function buildRmngHybridMatterDevices(
    mergedData: Record<string, unknown>,
    preferredDeviceName?: string,
    writeContext?: HybridMatterParamWriteContext,
): ESPCDFDevice[] {
    const endpoints = mergedData?.endpoints as
        | Record<string, Record<string, unknown>>
        | undefined;
    const info = mergedData?.info as { name?: string } | undefined;
    const deviceName = preferredDeviceName ?? info?.name ?? DEFAULT_DEVICE_NAME;

    const onOffEpIds = collectOnOffServerEndpointIds(endpoints);
    const isLightLike = endpointsExposeLightCapabilities(endpoints);

    if (onOffEpIds.length > 1 && !isLightLike) {
        return onOffEpIds.map((epId) => {
            const epData = (endpoints?.[epId] ?? {}) as Record<string, unknown>;
            const servers = getEndpointServerClusters(epData);
            const po = getAttrVal(getServerAttr(servers, ON_OFF, ATTR_ON_OFF));
            const powerPath: MatterPath = {
                endpoint: epId,
                role: "servers",
                cluster: ON_OFF,
                type: "attributes",
                attr: ATTR_ON_OFF,
            };
            const params = [
                makeParam(
                    "Power",
                    "esp.param.power",
                    "bool",
                    po !== undefined ? !!po : undefined,
                    powerPath,
                    writeContext,
                ),
            ];
            const internalName = matterEndpointInternalDeviceName(epId);
            return new ESPCDFDevice({
                name: internalName,
                displayName: `${deviceName} (${epId})`,
                type: "esp.device.switch",
                params,
                operations: { getParams: async () => params },
                _raw: { matterEndpointId: epId },
            });
        });
    }

    let powerValue: boolean | undefined;
    const powerPath: MatterPath = {
        endpoint: "0x1",
        role: "servers",
        cluster: ON_OFF,
        type: "attributes",
        attr: ATTR_ON_OFF,
    };
    let brightnessValue: number | undefined;
    const brightnessPath: MatterPath = {
        endpoint: "0x1",
        role: "servers",
        cluster: LEVEL,
        type: "attributes",
        attr: ATTR_CURRENT_LEVEL,
    };
    let hueValue: number | undefined;
    const huePath: MatterPath = {
        endpoint: "0x1",
        role: "servers",
        cluster: COLOR,
        type: "attributes",
        attr: ATTR_CURRENT_HUE,
    };
    let satValue: number | undefined;
    const satPath: MatterPath = {
        endpoint: "0x1",
        role: "servers",
        cluster: COLOR,
        type: "attributes",
        attr: ATTR_CURRENT_SATURATION,
    };
    let cctValue: number | undefined;
    const cctPath: MatterPath = {
        endpoint: "0x1",
        role: "servers",
        cluster: COLOR,
        type: "attributes",
        attr: ATTR_COLOR_TEMP_MIREDS,
    };

    const onoffEp = findEndpointWithServerCluster(endpoints, ON_OFF);
    if (onoffEp) powerPath.endpoint = onoffEp;

    const supportsPower = endpoints
        ? Object.values(endpoints).some((ep) =>
              serversSupportPowerControl(getEndpointServerClusters(ep)),
          )
        : !!onoffEp;
    const supportsLevel = endpoints
        ? Object.values(endpoints).some((ep) =>
              serversSupportLevelControl(getEndpointServerClusters(ep)),
          )
        : false;
    const supportsColor = endpointsAdvertiseColorAttr(endpoints, ATTR_CURRENT_HUE)
        || endpointsAdvertiseColorAttr(endpoints, ATTR_CURRENT_SATURATION)
        || endpointsAdvertiseColorAttr(endpoints, ATTR_COLOR_TEMP_MIREDS);
    const supportsHue = endpointsAdvertiseColorAttr(endpoints, ATTR_CURRENT_HUE);
    const supportsSaturation = endpointsAdvertiseColorAttr(
        endpoints,
        ATTR_CURRENT_SATURATION,
    );
    const supportsCct = endpointsAdvertiseColorAttr(endpoints, ATTR_COLOR_TEMP_MIREDS);

    const levelEp = findEndpointWithServerCluster(endpoints, LEVEL);
    if (levelEp) brightnessPath.endpoint = levelEp;
    const colorEp = findEndpointWithServerCluster(endpoints, COLOR);
    if (colorEp) {
        huePath.endpoint = colorEp;
        satPath.endpoint = colorEp;
        cctPath.endpoint = colorEp;
    }

    if (endpoints) {
        for (const [epId, epData] of Object.entries(endpoints)) {
            const servers = getEndpointServerClusters(epData);
            if (!servers) continue;

            const po = getAttrVal(getServerAttr(servers, ON_OFF, ATTR_ON_OFF));
            if (powerValue === undefined && po !== undefined) {
                powerValue = !!po;
                powerPath.endpoint = epId;
            }
            const bl = getAttrVal(getServerAttr(servers, LEVEL, ATTR_CURRENT_LEVEL));
            if (brightnessValue === undefined && typeof bl === "number") {
                brightnessValue = bl;
                brightnessPath.endpoint = epId;
            }
            const hu = getAttrVal(getServerAttr(servers, COLOR, ATTR_CURRENT_HUE));
            if (hueValue === undefined && typeof hu === "number") {
                hueValue = hu;
                huePath.endpoint = epId;
            }
            const sa = getAttrVal(getServerAttr(servers, COLOR, ATTR_CURRENT_SATURATION));
            if (satValue === undefined && typeof sa === "number") {
                satValue = sa;
                satPath.endpoint = epId;
            }
            const ct = getAttrVal(getServerAttr(servers, COLOR, ATTR_COLOR_TEMP_MIREDS));
            if (cctValue === undefined && typeof ct === "number") {
                cctValue = ct;
                cctPath.endpoint = epId;
            }
        }
    }

    const params: ESPCDFDeviceParam[] = [];
    if (supportsPower) {
        params.push(
            makeParam("Power", "esp.param.power", "bool", powerValue, powerPath, writeContext),
        );
    }
    if (supportsLevel) {
        params.push(
            makeParam(
                "Brightness",
                "esp.param.brightness",
                "int",
                brightnessValue !== undefined
                    ? Math.round((Number(brightnessValue) / 254) * 100)
                    : undefined,
                brightnessPath,
                writeContext,
                { min: 0, max: 100 },
            ),
        );
    }
    if (supportsColor) {
        if (supportsHue) {
            params.push(
                makeParam(
                    "Hue",
                    "esp.param.hue",
                    "int",
                    hueValue !== undefined
                        ? decodeUiParamValue("Hue", hueValue)
                        : undefined,
                    huePath,
                    writeContext,
                    { min: 0, max: 360 },
                ),
            );
        }
        if (supportsSaturation) {
            params.push(
                makeParam(
                    "Saturation",
                    "esp.param.saturation",
                    "int",
                    satValue !== undefined
                        ? decodeUiParamValue("Saturation", satValue)
                        : undefined,
                    satPath,
                    writeContext,
                    { min: 0, max: 100 },
                ),
            );
        }
        if (supportsCct) {
            params.push(
                makeParam(
                    "ColorTemperature",
                    "esp.param.cct",
                    "int",
                    cctValue !== undefined
                        ? decodeUiParamValue("CCT", cctValue)
                        : undefined,
                    cctPath,
                    writeContext,
                ),
            );
        }
    }

    const deviceType =
        supportsPower && !supportsLevel && !supportsColor
            ? "esp.device.switch"
            : "esp.device.lightbulb";

    return [
        new ESPCDFDevice({
            name: deviceName,
            displayName: deviceName,
            type: deviceType,
            params,
            operations: { getParams: async () => params },
            _raw: { matterMergedDevice: true },
        }),
    ];
}

/**
 * Builds one CDF device from a single Matter endpoint's clusters.
 * Used for bridged children so params never cross endpoint boundaries.
 */
export function buildMatterDeviceForEndpoint(
    epId: string,
    epData: Record<string, unknown>,
    deviceName: string,
    matterDeviceType?: number,
    writeContext?: HybridMatterParamWriteContext,
): ESPCDFDevice | undefined {
    const servers = getEndpointServerClusters(epData);
    if (!servers) return undefined;

    const supportsPower = serversSupportPowerControl(servers);
    const supportsLevel =
        matterDeviceType !== undefined
            ? matterDeviceTypeSupportsLevel(matterDeviceType)
            : serversSupportLevelControl(servers);
    const supportsHue = serverAdvertisesAttr(servers, COLOR, ATTR_CURRENT_HUE);
    const supportsSaturation = serverAdvertisesAttr(
        servers,
        COLOR,
        ATTR_CURRENT_SATURATION,
    );
    const supportsCct = serverAdvertisesAttr(servers, COLOR, ATTR_COLOR_TEMP_MIREDS);
    const supportsColor = supportsHue || supportsSaturation || supportsCct;

    if (!supportsPower && !supportsLevel && !supportsColor) return undefined;

    const powerPath: MatterPath = {
        endpoint: epId,
        role: "servers",
        cluster: ON_OFF,
        type: "attributes",
        attr: ATTR_ON_OFF,
    };
    const brightnessPath: MatterPath = {
        endpoint: epId,
        role: "servers",
        cluster: LEVEL,
        type: "attributes",
        attr: ATTR_CURRENT_LEVEL,
    };
    const huePath: MatterPath = {
        endpoint: epId,
        role: "servers",
        cluster: COLOR,
        type: "attributes",
        attr: ATTR_CURRENT_HUE,
    };
    const satPath: MatterPath = {
        endpoint: epId,
        role: "servers",
        cluster: COLOR,
        type: "attributes",
        attr: ATTR_CURRENT_SATURATION,
    };
    const cctPath: MatterPath = {
        endpoint: epId,
        role: "servers",
        cluster: COLOR,
        type: "attributes",
        attr: ATTR_COLOR_TEMP_MIREDS,
    };

    const po = getAttrVal(getServerAttr(servers, ON_OFF, ATTR_ON_OFF));
    const bl = getAttrVal(getServerAttr(servers, LEVEL, ATTR_CURRENT_LEVEL));
    const hu = getAttrVal(getServerAttr(servers, COLOR, ATTR_CURRENT_HUE));
    const sa = getAttrVal(getServerAttr(servers, COLOR, ATTR_CURRENT_SATURATION));
    const ct = getAttrVal(getServerAttr(servers, COLOR, ATTR_COLOR_TEMP_MIREDS));

    const params: ESPCDFDeviceParam[] = [];
    if (supportsPower) {
        params.push(
            makeParam(
                "Power",
                "esp.param.power",
                "bool",
                po !== undefined ? !!po : undefined,
                powerPath,
                writeContext,
            ),
        );
    }
    if (supportsLevel) {
        params.push(
            makeParam(
                "Brightness",
                "esp.param.brightness",
                "int",
                typeof bl === "number"
                    ? Math.round((Number(bl) / 254) * 100)
                    : undefined,
                brightnessPath,
                writeContext,
                { min: 0, max: 100 },
            ),
        );
    }
    if (supportsColor) {
        if (supportsHue) {
            params.push(
                makeParam(
                    "Hue",
                    "esp.param.hue",
                    "int",
                    typeof hu === "number" ? decodeUiParamValue("Hue", hu) : undefined,
                    huePath,
                    writeContext,
                    { min: 0, max: 360 },
                ),
            );
        }
        if (supportsSaturation) {
            params.push(
                makeParam(
                    "Saturation",
                    "esp.param.saturation",
                    "int",
                    typeof sa === "number"
                        ? decodeUiParamValue("Saturation", sa)
                        : undefined,
                    satPath,
                    writeContext,
                    { min: 0, max: 100 },
                ),
            );
        }
        if (supportsCct) {
            params.push(
                makeParam(
                    "ColorTemperature",
                    "esp.param.cct",
                    "int",
                    typeof ct === "number" ? decodeUiParamValue("CCT", ct) : undefined,
                    cctPath,
                    writeContext,
                ),
            );
        }
    }

    const deviceType =
        supportsPower && !supportsLevel && !supportsColor
            ? "esp.device.switch"
            : "esp.device.lightbulb";

    return new ESPCDFDevice({
        name: deviceName,
        displayName: deviceName,
        type: deviceType,
        params,
        operations: { getParams: async () => params },
        _raw: {
            matterEndpointId: epId,
            matterDeviceType,
        },
    });
}
