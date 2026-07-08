/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Matter path stored on CDF params after multi-endpoint split. */
export type MatterParamPath = {
    endpoint?: string;
    role?: string;
    cluster?: string;
    type?: string;
    attr?: string;
};

type DeviceWithMatterParams = {
    name?: string;
    params?: { name?: string; _matterPath?: MatterParamPath }[];
};

const DEFAULT_ENDPOINT_INT = 1;

/** Parse internal split device name (e.g. ep_2 → 2, ep_a → 10). */
export function endpointFromInternalDeviceName(deviceName?: string): number | null {
    if (!deviceName) return null;
    const match = /^ep_([0-9a-f]+)$/i.exec(deviceName.trim());
    if (!match) return null;
    const parsed = parseInt(match[1], 16);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseEndpointHex(ep: string): string {
    if (!ep) return "0x1";
    return ep.startsWith("0x") || ep.startsWith("0X") ? ep.toLowerCase() : `0x${ep}`;
}

function parseEndpointInt(epHex: string): number {
    const parsed = parseInt(epHex.replace(/^0x/i, ""), 16);
    return Number.isNaN(parsed) ? DEFAULT_ENDPOINT_INT : parsed;
}

/** Matter local control endpoint from a CDF device's param `_matterPath` (default 1). */
export function resolveMatterEndpointFromDevice(
    device?: DeviceWithMatterParams | null,
    paramName = "Power",
): number {
    return resolveMatterEndpointFromDeviceWithFallbacks(device, [paramName]);
}

/** Try param names in order, then `ep_*` device name, then default endpoint 1. */
export function resolveMatterEndpointFromDeviceWithFallbacks(
    device?: DeviceWithMatterParams | null,
    paramNames: string[] = ["Power"],
): number {
    for (const paramName of paramNames) {
        const path = device?.params?.find((param) => param.name === paramName)?._matterPath;
        if (path?.endpoint) {
            return parseEndpointInt(parseEndpointHex(path.endpoint));
        }
    }
    const fromName = endpointFromInternalDeviceName(device?.name);
    return fromName ?? DEFAULT_ENDPOINT_INT;
}
