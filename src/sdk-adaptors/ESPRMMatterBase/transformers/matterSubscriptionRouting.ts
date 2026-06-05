/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPNodeUpdateData, ESPRMNode } from "@espressif/rainmaker-base-sdk";
import {
    getClusterRegistryEntry,
    MATTER_PARAM_VALUE_UNKNOWN,
} from "@espressif/rainmaker-matter-sdk";
import {
    coerceParamValueToBoolean,
    isBooleanControlParamByLabels,
} from "@shared/utils/paramUtils";

/**
 * Rebuilds a Matter subscription update so the existing CDF
 * `handleNodeParamsChanged` shadow-style consumer can route it.
 *
 * The matter SDK's `MatterSubscriptionChannel.transformMatterToRainmaker` is
 * a hardcoded switch over a handful of Light clusters; everything else
 * (RVC `0x54/0x55/0x61`, PowerSource `0x2f`, …) falls into a `default`
 * branch that emits a flat `{ cluster_<id>_attr_<id>: <raw> }` payload —
 * a key no consumer recognises, so the UI never updates.
 *
 * This helper repairs the payload by going through the proper SDK pipeline
 * the matter node-transform already established:
 *  1. Locate the `ESPRMMatterDeviceParam` whose
 *     `(endpointId, clusterId, matterAttributeId)` triplet matches the
 *     `update.metadata` triplet — the same triplet
 *     `ESPRMMatterDeviceParam.getValue()` / `setValue()` use.
 *  2. Decode the raw value via the param's registered
 *     `resolver.decodeValue(raw, rawModes)` — same machinery `getValue()`
 *     uses, so Battery raw `95` becomes `"48"` (per-cent), Run-mode raw
 *     `0` becomes `"idle"` via `rawModes`, etc.
 *  3. Mutate `param.value` so subsequent local reads stay consistent.
 *  4. Emit shadow-style `{ [device.name]: { [param.name]: decoded } }`
 *     keyed by the SDK-built device name (`"0x1"`) and param name
 *     (`"Battery"`, `"Run Mode"`, …) — exactly what
 *     `handleNodeParamsChanged` expects to find via
 *     `node.devices.find(d => d.name === entityName)`.
 *
 * Wildcard subscriptions (e.g. PowerSource `0x2f`) deliver one update per
 * reported attribute. Updates whose attribute does not map to a registered
 * param produce an empty shadow and are dropped by the caller.
 * @param update    Subscription update from the matter channel.
 * @param sdkNodes  Latest SDK node list captured by `subscribeToNodeUpdates`.
 * @returns A shadow-style payload `{ [deviceName]: { [paramName]: value } }`,
 *          or `undefined` when no matter param matches (let the caller
 *          forward the original payload unchanged or drop it).
 */
export function rewriteMatterShadowPayload(
    update: ESPNodeUpdateData,
    sdkNodes: ESPRMNode[],
): Record<string, Record<string, unknown>> | undefined {
    const meta = update.metadata as
        | {
              clusterId?: number;
              endpointId?: number;
              attributeId?: number;
          }
        | undefined;
    if (
        !meta ||
        meta.clusterId === undefined ||
        meta.endpointId === undefined ||
        meta.attributeId === undefined
    ) {
        return undefined;
    }
    const { clusterId, endpointId, attributeId } = meta;

    const node = sdkNodes.find((n) => n.id === update.nodeId);
    if (!node) return undefined;

    // Recover the raw matter value. The matter SDK's default-branch payload
    // shape is `{ cluster_<dec>_attr_<dec>: rawValue }`. Fall back to other
    // common shapes defensively, since handled-cluster payload keys differ.
    const rawValue = extractRawMatterValue(
        update.payload,
        clusterId,
        attributeId,
    );

    // Walk nodeConfig.devices to find the param matching the metadata
    // triplet. We accept both `ESPRMMatterDeviceParam` (with `clusterId` /
    // `endpointId` / `matterAttributeId`) and lower-cased aliases other
    // transforms might produce, to stay robust against minor SDK shape
    // drift.
    const devices = (node as unknown as {
        nodeConfig?: {
            devices?: {
                name?: string;
                params?: MatterDeviceParamLike[];
            }[];
        };
    }).nodeConfig?.devices;
    if (!devices) return undefined;

    for (const device of devices) {
        if (!device?.params || !device.name) continue;
        for (const param of device.params) {
            if (!isMatterParamMatch(param, endpointId, clusterId, attributeId)) {
                continue;
            }
            const decoded = decodeMatterParamValue(param, rawValue);
            if (decoded === undefined) return undefined;
            if (isUnmappableMatterEnumValue(decoded)) {
                // FW emitted a manufacturer-specific or transient enum the
                // resolver can't map (e.g. RvcOperationalState=0x81 from this
                // customer FW between Running frames). Dropping the frame
                // preserves the last known good UI state instead of flickering
                // the tile to "unknown" and disabling its action button.
                return undefined;
            }

            // Mutate the SDK-side param value so future `getValue()` reads
            // are consistent with the most recent subscription frame
            // without a network round-trip. The CDF `handleNodeParamsChanged`
            // separately mutates the CDF mirror.
            (param as { value?: unknown }).value = decoded;

            return {
                [device.name]: {
                    [param.name as string]: decoded,
                },
            };
        }
    }

    // Fallback path: no built param exposed `matterAttributeId === attributeId`.
    // The matter SDK's `buildClusterParams` strips `matterAttributeId` to
    // `undefined` whenever `writeAsCommand: true` or `matterCommandId` is set
    // on a `paramDef` (see resolveMatterAttributeId in the SDK). That hides
    // the param from our triplet match for ModeBase derivatives like
    // RvcRunMode (0x54) and RvcCleanMode (0x55), and the OperationalState
    // "Control" tile (0x61 attr 0x4) — even though they ARE registered with
    // a `valueAttribute` that should route reads.
    //
    // Recover the routing by consulting the cluster registry directly,
    // matching `paramDef.valueAttribute === attributeId`, then locating the
    // built param on the SDK node via (clusterId, endpointId, paramDef.name).
    const registryEntry = getClusterRegistryEntry(clusterId);
    const fallbackParamDef = registryEntry?.params.find(
        (p) => p.valueAttribute === attributeId,
    );
    if (!fallbackParamDef) return undefined;

    for (const device of devices) {
        if (!device?.params || !device.name) continue;
        for (const param of device.params) {
            if (
                param.endpointId !== endpointId ||
                param.clusterId !== clusterId ||
                param.name !== fallbackParamDef.name
            ) {
                continue;
            }
            const decoded = decodeMatterParamValue(param, rawValue);
            if (decoded === undefined) return undefined;
            if (isUnmappableMatterEnumValue(decoded)) {
                // Same rationale as in the direct-match branch above —
                // see the comment there.
                return undefined;
            }
            (param as { value?: unknown }).value = decoded;
            return {
                [device.name]: {
                    [param.name as string]: decoded,
                },
            };
        }
    }
    return undefined;
}

/**
 * Returns whether a resolver-decoded value is the "unknown" sentinel emitted
 * by `createMappingResolver` / `createTransformResolver` when the raw matter
 * value falls outside the registered enum or transform's valid range.
 *
 * Both the SDK constant and the literal string `"unknown"` are treated as
 * equivalent so adaptor-side resolvers stay robust against constant-import
 * drift while the central `MATTER_PARAM_VALUE_UNKNOWN = "unknown"` definition
 * remains the source of truth.
 */
function isUnmappableMatterEnumValue(decoded: unknown): boolean {
    return (
        typeof decoded === "string" &&
        (decoded === MATTER_PARAM_VALUE_UNKNOWN || decoded === "unknown")
    );
}

/** Subset of {@link ESPRMMatterDeviceParam} fields we read here. */
interface MatterDeviceParamLike {
    name?: string;
    value?: unknown;
    dataType?: string;
    uiType?: string;
    type?: string;
    clusterId?: number;
    endpointId?: number;
    matterAttributeId?: number;
    rawModes?: Record<string, number>;
    resolver?: {
        decodeValue?: (
            rawValue: unknown,
            rawModes?: Record<string, number>,
        ) => string;
    };
}

function isMatterParamMatch(
    param: MatterDeviceParamLike,
    endpointId: number,
    clusterId: number,
    attributeId: number,
): boolean {
    return (
        param.endpointId === endpointId &&
        param.clusterId === clusterId &&
        param.matterAttributeId === attributeId
    );
}

/**
 * Pulls the raw matter value out of the SDK's flat payload. The default
 * branch of `MatterSubscriptionChannel.transformMatterToRainmaker` keys it
 * as `cluster_<dec>_attr_<dec>`; for handled clusters (OnOff/LevelControl/…)
 * the payload may already use a friendly key — there we fall back to the
 * single payload entry's value, which is good enough for the param's own
 * resolver to decode (most resolvers either pass-through or coerce).
 */
function extractRawMatterValue(
    payload: unknown,
    clusterId: number,
    attributeId: number,
): unknown {
    if (!payload || typeof payload !== "object") return undefined;
    const flat = payload as Record<string, unknown>;
    const defaultKey = `cluster_${clusterId}_attr_${attributeId}`;
    if (defaultKey in flat) return flat[defaultKey];
    const entries = Object.entries(flat);
    if (entries.length === 1) return entries[0][1];
    return undefined;
}

function normalizeDecodedParamValue(
    param: MatterDeviceParamLike,
    decoded: unknown,
): unknown {
    const dataType = (param.dataType ?? "").toLowerCase();
    if (
        dataType === "bool" ||
        dataType === "boolean" ||
        isBooleanControlParamByLabels(param)
    ) {
        return coerceParamValueToBoolean(decoded);
    }
    return decoded;
}

function decodeMatterParamValue(
    param: MatterDeviceParamLike,
    rawValue: unknown,
): unknown {
    if (rawValue === undefined) return undefined;
    const decoder = param.resolver?.decodeValue;
    if (typeof decoder !== "function") {
        return normalizeDecodedParamValue(param, rawValue);
    }
    try {
        return normalizeDecodedParamValue(
            param,
            decoder(rawValue, param.rawModes),
        );
    } catch (error) {
        console.warn(
            "[matterSubscriptionRouting] resolver.decodeValue threw:",
            error,
        );
        return undefined;
    }
}
