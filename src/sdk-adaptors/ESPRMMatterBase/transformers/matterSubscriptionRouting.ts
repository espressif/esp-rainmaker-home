/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPNodeUpdateData } from "@espressif/rainmaker-base-sdk";
import {
    getClusterRegistryEntry,
    type ClusterParamDefinition,
    type ClusterParamResolver,
} from "@espressif/rainmaker-matter-sdk";
import { MATTER_PARAM_VALUE_UNKNOWN } from "../matterParamConstants";
import {
    coerceParamValueForDataType,
    coerceParamValueToBoolean,
    isBooleanControlParamByLabels,
    resolveParamDataType,
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
 * Hybrid RainMaker + Matter nodes have no Matter metadata on their params at
 * all and route by name instead — see {@link buildCloudParamShadow}.
 *
 * Wildcard subscriptions (e.g. PowerSource `0x2f`) deliver one update per
 * reported attribute. Updates whose attribute does not map to a registered
 * param produce an empty shadow and are dropped by the caller.
 * @param update    Subscription update from the matter channel.
 * @param sdkNodes  Latest SDK node list captured by `subscribeToNodeUpdates`.
 * @returns A shadow-style payload `{ [deviceName]: { [paramName]: value } }`,
 *          or `undefined` when no param matches (let the caller forward the
 *          original payload unchanged or drop it).
 */
type MatterRoutingNode = {
    id?: string;
    nodeId?: string;
    nodeConfig?: {
        devices?: { name?: string; params?: MatterDeviceParamLike[] }[];
    };
    devices?: { name?: string; params?: MatterDeviceParamLike[] }[];
};

export function rewriteMatterShadowPayload(
    update: ESPNodeUpdateData,
    sdkNodes: MatterRoutingNode[],
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

    const node = sdkNodes.find(
        (n) => (n.id ?? n.nodeId) === update.nodeId,
    );
    if (!node) return undefined;

    // Recover the raw matter value. The matter SDK's default-branch payload
    // shape is `{ cluster_<dec>_attr_<dec>: rawValue }`. Fall back to other
    // common shapes defensively, since handled-cluster payload keys differ.
    const extracted = extractMatterSubscriptionValue(
      update.payload,
      clusterId,
      attributeId,
    );
    const extractedValue = extracted?.value;
    // Skip the app resolver only for values the SDK already scaled (see
    // SDK_PRESCALED_ATTRS) — re-decoding those double-scales (100% → 39%). Raw
    // frames still decode; defaults to raw for unclassifiable shapes.
    const isRaw = extracted?.isRaw ?? true;
    const sdkAlreadyScaled =
      !isRaw && isSdkPrescaledAttr(clusterId, attributeId);

    // Walk nodeConfig.devices (Rainmaker) or top-level devices (RMNG Matter payload).
    const devices = collectMatterRoutingDevices(node);
    if (!devices) return undefined;

    for (const device of devices) {
        if (!device?.params || !device.name) continue;
        for (const param of device.params) {
            if (!isMatterParamMatch(param, endpointId, clusterId, attributeId)) {
                continue;
            }
            const decoded = sdkAlreadyScaled
              ? normalizeDecodedParamValue(param, extractedValue)
              : decodeMatterParamValue(param, extractedValue);
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
            const decoded = sdkAlreadyScaled
              ? normalizeDecodedParamValue(param, extractedValue)
              : decodeMatterParamValue(param, extractedValue);
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

    // Last resort: hybrid RainMaker + Matter nodes. The SDK's `isMatterNode()`
    // only accepts `node_type === "pure_matter"`, so a Matter-commissioned
    // RainMaker node is built from its cloud config — params carry no
    // `(endpointId, clusterId, matterAttributeId)` and both matches above always
    // miss. Forwarding the flat payload loses it silently: CDF
    // `handleNodeParamsChanged` reads top-level keys as DEVICE names, so `Power`
    // matches nothing. Match the cloud param by registry name instead.
    return buildCloudParamShadow(
        devices,
        fallbackParamDef,
        extractedValue,
        sdkAlreadyScaled,
    );
}

/** Registry param name → cloud param names for the same control. */
const CLOUD_PARAM_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
    CCT: ["ColorTemperature"],
};

/**
 * Builds the shadow for a cloud-config param matched by registry name — the
 * hybrid-node path, where no param carries Matter cluster metadata.
 * @param devices          Devices of the node the update belongs to.
 * @param paramDef         Registry definition matched on `valueAttribute`.
 * @param extractedValue   Value pulled from the update payload.
 * @param sdkAlreadyScaled Whether the SDK already scaled it (see {@link SDK_PRESCALED_ATTRS}).
 * @returns The shadow payload, or `undefined` when nothing matched unambiguously.
 */
function buildCloudParamShadow(
    devices: { name?: string; params?: MatterDeviceParamLike[] }[],
    paramDef: ClusterParamDefinition,
    extractedValue: unknown,
    sdkAlreadyScaled: boolean,
): Record<string, Record<string, unknown>> | undefined {
    const candidateNames = [
        paramDef.name,
        ...(CLOUD_PARAM_NAME_ALIASES[paramDef.name] ?? []),
    ];

    const matches: { deviceName: string; param: MatterDeviceParamLike }[] = [];
    for (const device of devices) {
        if (!device?.params || !device.name) continue;
        for (const param of device.params) {
            // Cloud params only. A matter-built param already had its chance in
            // both matches above, and matching one by name alone could route the
            // frame onto a different cluster's param.
            if (param.clusterId !== undefined) continue;
            if (!param.name || !candidateNames.includes(param.name)) continue;
            matches.push({ deviceName: device.name, param });
        }
    }

    if (matches.length === 0) return undefined;
    // Multi-gang: the name repeats per gang and a cloud param carries nothing to
    // tie it to `endpointId`. Drop rather than apply it to a guessed device.
    if (matches.length > 1) {
        console.warn(
            `[matterSubscriptionRouting] dropping frame for "${paramDef.name}": matched cloud params on ${matches.length} devices, no endpoint mapping to disambiguate`,
        );
        return undefined;
    }

    const { deviceName, param } = matches[0];
    // Decode through the registry definition — the cloud param has no resolver of
    // its own, and this is what turns CCT mireds into the Kelvin the UI expects.
    const decoded = sdkAlreadyScaled
        ? normalizeDecodedParamValue(param, extractedValue)
        : decodeMatterParamValue(param, extractedValue, paramDef.resolver);
    if (decoded === undefined) return undefined;
    if (isUnmappableMatterEnumValue(decoded)) return undefined;

    // Resolvers emit strings; keep the RainMaker mirror on its declared type.
    const value = coerceParamValueForDataType(
        decoded,
        resolveParamDataType(param),
        param.bounds,
    );
    (param as { value?: unknown }).value = value;
    return {
        [deviceName]: {
            [param.name as string]: value,
        },
    };
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
    /** Cloud-config params carry UI bounds (min/max/step) used when coercing. */
    bounds?: Record<string, any>;
    _raw?: { cluster?: number; attribute?: number; endpointId?: number };
    resolver?: {
        decodeValue?: (
            rawValue: unknown,
            rawModes?: Record<string, number>,
        ) => string;
    };
}

function collectMatterRoutingDevices(
    node: MatterRoutingNode,
): { name?: string; params?: MatterDeviceParamLike[] }[] | undefined {
    const fromNodeConfig = node.nodeConfig?.devices;

    if (fromNodeConfig?.length) return fromNodeConfig;

    return node.devices?.length ? node.devices : undefined;
}

function isMatterParamMatch(
    param: MatterDeviceParamLike,
    endpointId: number,
    clusterId: number,
    attributeId: number,
): boolean {
    const paramEndpoint = param.endpointId ?? param._raw?.endpointId ?? endpointId;
    const paramCluster = param.clusterId ?? param._raw?.cluster;
    const paramAttribute = param.matterAttributeId ?? param._raw?.attribute;
    return (
        paramEndpoint === endpointId &&
        paramCluster === clusterId &&
        paramAttribute === attributeId
    );
}

/**
 * Pulls the value for (clusterId, attributeId) out of the SDK's flat payload and
 * reports whether it still needs resolver decoding: raw `cluster_<c>_attr_<a>`
 * frames are `isRaw: true` (decode); values the SDK already decoded under a
 * friendly key (e.g. `{ Brightness: 100 }`) are `isRaw: false` (pass through).
 */
function extractMatterSubscriptionValue(
  payload: unknown,
  clusterId: number,
  attributeId: number,
): { value: unknown; isRaw: boolean } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const flat = payload as Record<string, unknown>;
  const defaultKey = `cluster_${clusterId}_attr_${attributeId}`;
  if (defaultKey in flat) {
    return { value: flat[defaultKey], isRaw: true };
  }
  const entries = Object.entries(flat);
  if (entries.length === 1) {
    return { value: entries[0][1], isRaw: false };
  }
  return undefined;
}

/**
 * `<clusterId>:<attributeId>` pairs the RM-Matter SDK already scales into
 * Rainmaker units on push frames — running the app resolver again double-scales
 * them. Excludes CCT (768/7) and Power (6/0): the SDK renames but doesn't scale
 * those, so they still need the resolver. Keep in sync with the SDK switch.
 */
const SDK_PRESCALED_ATTRS: ReadonlySet<string> = new Set([
    "8:0", // LevelControl CurrentLevel
    "768:0", // ColorControl CurrentHue
    "768:1", // ColorControl CurrentSaturation
    "1026:0", // TemperatureMeasurement
]);

function isSdkPrescaledAttr(clusterId: number, attributeId: number): boolean {
    return SDK_PRESCALED_ATTRS.has(`${clusterId}:${attributeId}`);
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

/**
 * @param resolverOverride Resolver to decode with when the param has none of its
 *   own — cloud-config params are built without one.
 */
function decodeMatterParamValue(
    param: MatterDeviceParamLike,
    rawValue: unknown,
    resolverOverride?: ClusterParamResolver,
): unknown {
    if (rawValue === undefined) return undefined;
    const decoder = param.resolver?.decodeValue ?? resolverOverride?.decodeValue;
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
