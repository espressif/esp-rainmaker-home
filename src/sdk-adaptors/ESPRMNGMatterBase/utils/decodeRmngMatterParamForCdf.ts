/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { getClusterRegistryEntry } from "@espressif/rmng-matter-sdk";
import { MATTER_TEMPERATURE_SCALE_FACTOR } from "@sdk-adaptors/ESPRMMatterBase/matterParamConstants";
import {
    brightnessPercentToMatterLevel,
    hueDegreesToMatterHue,
    kelvinToMatterMireds,
    saturationPercentToMatterSaturation,
} from "@sdk-adaptors/ESPRMMatterBase/utils/matterInvokePayload";
import { LIGHT_PARAM_TO_MATTER_PATH } from "./rmngMatterTopologyHelpers";

/** Params that `transformMatterToRMNG` already converts before the app receives them. */
const SDK_SUBSCRIPTION_ALREADY_UI = new Set([
    "Power",
    "CCT",
    "ColorTemperature",
    "Temperature",
]);

export type MatterParamDecodeContext =
    | "matter_data"
    | "mqtt_shadow"
    | "matter_subscription"
    | "rewrite_shadow";

function cdfParamName(paramName: string): string {
    return paramName === "ColorTemperature" ? "CCT" : paramName;
}

/**
 * Decode Matter raw attribute values through the cluster registry (same path as
 * MQTT shadow and pure Matter subscription routing).
 */
export function decodeRmngMatterParamForCdf(
    paramName: string,
    raw: unknown,
): unknown {
    const cdfName = cdfParamName(paramName);
    const path =
        LIGHT_PARAM_TO_MATTER_PATH[paramName] ?? LIGHT_PARAM_TO_MATTER_PATH[cdfName];
    if (!path || raw === undefined || raw === null) return raw;

    const clusterId = parseInt(path.cluster, 16);
    const attrId = parseInt(path.attribute, 16);
    const entry = getClusterRegistryEntry(clusterId);
    const paramDef = entry?.params?.find(
        (p) =>
            p.name === paramName ||
            p.name === cdfName ||
            p.valueAttribute === attrId,
    );
    const decoder = paramDef?.resolver?.decodeValue;
    if (typeof decoder !== "function") return raw;

    try {
        const decoded = decoder(
            raw,
            (paramDef as { rawModes?: Record<string, number> }).rawModes,
        );
        if (cdfName === "Power") {
            return decoded === "true" || raw === true || raw === 1;
        }
        return decoded;
    } catch {
        return raw;
    }
}

/**
 * Encodes a UI-domain param value for persistence in `matter_data` attribute
 * slots (Matter raw / mireds for CCT).
 */
export function encodeRmngMatterParamForMatterData(
    paramName: string,
    uiValue: unknown,
): unknown {
    const cdfName = cdfParamName(paramName);

    if (cdfName === "Power") {
        if (typeof uiValue === "boolean") return uiValue ? 1 : 0;
        return uiValue;
    }

    if (typeof uiValue !== "number" || !Number.isFinite(uiValue)) return uiValue;

    switch (cdfName) {
        case "CCT":
            return kelvinToMatterMireds(uiValue);
        case "Brightness":
            return brightnessPercentToMatterLevel(uiValue);
        case "Hue":
            return hueDegreesToMatterHue(uiValue);
        case "Saturation":
            return saturationPercentToMatterSaturation(uiValue);
        case "Temperature":
            return Math.round(uiValue * MATTER_TEMPERATURE_SCALE_FACTOR);
        default:
            return uiValue;
    }
}

function isSdkPreconvertedSubscriptionParam(paramName: string): boolean {
    const normalized = cdfParamName(paramName);
    return (
        SDK_SUBSCRIPTION_ALREADY_UI.has(paramName) ||
        SDK_SUBSCRIPTION_ALREADY_UI.has(normalized)
    );
}

/**
 * Coerce an incoming Matter param value into CDF/UI units for the given source.
 * Subscription frames from the RMNG Matter SDK only pre-convert CCT/Temperature/Power;
 * Brightness/Hue/Saturation still arrive as Matter raw bytes and need registry decode.
 */
export function coerceMatterParamForCdf(
    paramName: string,
    incoming: unknown,
    context: MatterParamDecodeContext = "matter_data",
): unknown {
    if (incoming === undefined || incoming === null) return incoming;

    if (context === "rewrite_shadow") {
        return coerceDecodedRmngMatterParamValue(incoming);
    }

    if (context === "matter_subscription") {
        if (isSdkPreconvertedSubscriptionParam(paramName)) {
            return coerceDecodedRmngMatterParamValue(incoming);
        }
        return coerceDecodedRmngMatterParamValue(
            decodeRmngMatterParamForCdf(paramName, incoming),
        );
    }

    return coerceDecodedRmngMatterParamValue(
        decodeRmngMatterParamForCdf(paramName, incoming),
    );
}

/** Normalize registry decode output (often string) for CDF numeric params. */
export function coerceDecodedRmngMatterParamValue(decoded: unknown): unknown {
    if (decoded === undefined || decoded === null) return decoded;
    if (typeof decoded === "string") {
        const num = Number(decoded);
        return Number.isFinite(num) ? num : decoded;
    }
    return decoded;
}
