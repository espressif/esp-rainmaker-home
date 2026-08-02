/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceEventEmitter } from "react-native";
import type { ESPCDFNode, ESPCDFDeviceParam } from "@store";
import {
    endpointFromInternalDeviceName,
    resolveMatterEndpointFromDeviceWithFallbacks,
} from "./matterEndpoint";

export const MATTER_DEVICE_STATE_CHANGED = "MATTER_DEVICE_STATE_CHANGED";

export type MatterDeviceStateChangedEvent = {
    matterNodeId: string;
    endpoint?: number;
    power?: boolean;
    brightness?: number;
    hue?: number;
    saturation?: number;
    cct?: number;
};

/** Extracts a node's Matter node id, from its direct field or `metadata`. */
export function readMatterNodeIdFromCdfNode(node: ESPCDFNode): string | undefined {
    const direct = (node as { matterNodeId?: string }).matterNodeId;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const meta = node.metadata as
        | { matter_node_id?: string; matterNodeId?: string }
        | undefined;
    const fromMeta = meta?.matter_node_id ?? meta?.matterNodeId;
    return typeof fromMeta === "string" && fromMeta.trim() ? fromMeta.trim() : undefined;
}

/**
 * Extracts a Matter node's software version for display. The version is captured at
 * commissioning from the Basic Information cluster (0x28) and persisted under
 * `metadata.Matter`. Prefers the human-readable SoftwareVersionString, falling back to the numeric
 * SoftwareVersion. Also checks a flattened `metadata.*` location in case the
 * persistence layer hoists the fields out of the `Matter` sub-object.
 */
export function readMatterSoftwareVersionFromCdfNode(
    node: ESPCDFNode,
): string | undefined {
    const meta = node.metadata as
        | {
              Matter?: {
                  softwareVersion?: unknown;
                  softwareVersionString?: unknown;
              };
              softwareVersion?: unknown;
              softwareVersionString?: unknown;
          }
        | undefined;
    const matter = meta?.Matter;
    const str = matter?.softwareVersionString ?? meta?.softwareVersionString;
    if (typeof str === "string" && str.trim()) return str.trim();
    const num = matter?.softwareVersion ?? meta?.softwareVersion;
    if (typeof num === "string" && num.trim()) return num.trim();
    if (typeof num === "number" && Number.isFinite(num)) return String(num);
    return undefined;
}

/** Broadcast endpoint-scoped Matter param updates for shared `matterNodeId` UIs. */
export function emitMatterDeviceStateChanged(
    node: ESPCDFNode,
    deviceParams: Record<string, unknown>,
    options?: {
        endpointId?: number;
        deviceName?: string;
    },
): void {
    const matterNodeId = readMatterNodeIdFromCdfNode(node);
    if (!matterNodeId) return;

    const evt: MatterDeviceStateChangedEvent = { matterNodeId };
    if (options?.endpointId !== undefined) {
        evt.endpoint = options.endpointId;
    } else if (options?.deviceName) {
        const fromName = endpointFromInternalDeviceName(options.deviceName);
        if (fromName !== null) evt.endpoint = fromName;
    }

    if (deviceParams.Power !== undefined) {
        evt.power = Boolean(deviceParams.Power);
    }
    if (deviceParams.Brightness !== undefined) {
        evt.brightness = Number(deviceParams.Brightness);
    }
    if (deviceParams.Hue !== undefined) {
        evt.hue = Number(deviceParams.Hue);
    }
    if (deviceParams.Saturation !== undefined) {
        evt.saturation = Number(deviceParams.Saturation);
    }
    const cct = deviceParams.CCT ?? deviceParams.ColorTemperature ?? deviceParams.Temperature;
    if (cct !== undefined) {
        evt.cct = Number(cct);
    }

    if (
        evt.power === undefined &&
        evt.brightness === undefined &&
        evt.hue === undefined &&
        evt.saturation === undefined &&
        evt.cct === undefined
    ) {
        return;
    }

    DeviceEventEmitter.emit(MATTER_DEVICE_STATE_CHANGED, evt);
}

function eventMatchesEndpoint(
    event: MatterDeviceStateChangedEvent,
    allowedEndpoints: number[],
): boolean {
    if (event.endpoint === undefined) return true;
    if (allowedEndpoints.length === 0) return true;
    return allowedEndpoints.includes(event.endpoint);
}

type MatterParamBinding = {
    power?: ESPCDFDeviceParam;
    brightness?: ESPCDFDeviceParam;
    hue?: ESPCDFDeviceParam;
    saturation?: ESPCDFDeviceParam;
    temperature?: ESPCDFDeviceParam;
    cct?: ESPCDFDeviceParam;
};

/** Keeps control UI in sync when several `ep_*` devices share one Matter node id. */
export function subscribeMatterDeviceStateChanged(
    matterNodeId: string | undefined,
    allowedEndpoints: number[],
    params: MatterParamBinding,
    onUpdate: (apply: () => void) => void,
): () => void {
    if (!matterNodeId) return () => undefined;

    const listener = DeviceEventEmitter.addListener(
        MATTER_DEVICE_STATE_CHANGED,
        (event: MatterDeviceStateChangedEvent) => {
            if (event.matterNodeId !== matterNodeId) return;
            if (!eventMatchesEndpoint(event, allowedEndpoints)) return;

            onUpdate(() => {
                if (event.power !== undefined && params.power) {
                    (params.power as { value?: unknown }).value = event.power;
                }
                if (event.brightness !== undefined && params.brightness) {
                    (params.brightness as { value?: unknown }).value = event.brightness;
                }
                if (event.hue !== undefined && params.hue) {
                    (params.hue as { value?: unknown }).value = event.hue;
                }
                if (event.saturation !== undefined && params.saturation) {
                    (params.saturation as { value?: unknown }).value = event.saturation;
                }
                const tempParam = params.temperature ?? params.cct;
                if (event.cct !== undefined && tempParam) {
                    (tempParam as { value?: unknown }).value = event.cct;
                }
            });
        },
    );

    return () => listener.remove();
}

/** Returns the distinct Matter endpoint ids backing a device's control params. */
export function resolveMatterEndpointsForDevice(
    device?: { name?: string; params?: { name?: string; _matterPath?: { endpoint?: string } }[] } | null,
): number[] {
    const endpoints = new Set<number>();
    const power = resolveMatterEndpointFromDeviceWithFallbacks(device, ["Power"]);
    endpoints.add(power);
    endpoints.add(resolveMatterEndpointFromDeviceWithFallbacks(device, ["Brightness"]));
    endpoints.add(
        resolveMatterEndpointFromDeviceWithFallbacks(device, ["Hue", "Saturation"]),
    );
    endpoints.add(
        resolveMatterEndpointFromDeviceWithFallbacks(device, [
            "CCT",
            "ColorTemperature",
            "Temperature",
        ]),
    );
    return Array.from(endpoints);
}
