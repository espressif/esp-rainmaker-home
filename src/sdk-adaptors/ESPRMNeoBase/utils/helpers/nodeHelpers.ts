/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { runInAction } from "mobx";
import {
  ESPRMNeoNode,
  ESPTransportMode,
  getNcfgVersion,
  type ESPRMNeoNodeInfoAPI,
  type ESPRMNeoShadowDocument,
} from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPCDF,
  ESPCDFGroup,
  ESPCDFNode,
  ESPCDFNodeTransport,
  type ESPCDFDevice,
  type ESPCDFNodeInfoInterface,
  type ESPCDFPropertyChangeCallback,
  type ESPCDFPropertyChangeEvent,
  type ESPCDFTransportConfig,
} from "@store";
import { syncCdfDeviceDisplayName } from "@sdk-adaptors/shared/utils/common";
import { getRmneoStackAuthorizationUser } from "@sdk-adaptors/shared/rmneoAuthUser";
import {
  defaultMergeRmneoShadowParams,
  getRmneoNcfgRefreshHooks,
} from "@sdk-adaptors/shared/rmneoNcfgRefreshHooks";
import { EspLocalDiscoveryAdapter } from "@native-adaptors/implementations/ESPDiscoveryAdapter";
import { mergeLocalTransportFromNodeMap } from "@shared/utils/mergeNodeListLocalTransport";
import { kickMatterLocalDiscoveryAfterNodesInStore } from "@shared/utils/matterDiscoveryGroupCallbacks";
import {
  MDNS_DOMAIN_LOCAL,
  MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
} from "@shared/utils/constants";
import {
  ESPRMNEO_CDF_PROP_CHANGE,
  ESPRMNEO_NAME_PARAM_TYPE,
} from "../constants";

/**
 * Last shadow `ncfg_ver` already projected into CDF per node.
 * Separate from SDK storage markers so raw `sync()` and CDF rebuild do not race.
 */
const cdfProjectedNcfgByNodeId = new Map<string, string>();

/**
 * Maps `ESPRMNeoNode.config.info` onto the CDF info shape.
 *
 * The SDK already runs `transformNodeInfo` in `applyNodeConfig` (adds
 * `firmwareVersion` while keeping wire `fw_version`). We only normalize
 * empty strings for CDF consumers (e.g. Device Info) and prefer the SDK
 * camelCase field when present.
 * @param info - Live node config info (API + SDK-mapped fields).
 * @returns CDF node info, or `undefined` when missing.
 */
export function mapSdkNodeInfoToCdf(
  info: ESPRMNeoNodeInfoAPI | undefined,
): ESPCDFNodeInfoInterface | undefined {
  if (!info) {
    return undefined;
  }
  const sdkInfo = info as ESPRMNeoNodeInfoAPI & { firmwareVersion?: string };
  return {
    ...sdkInfo,
    name: sdkInfo.name ?? "",
    type: sdkInfo.type ?? "",
    model: sdkInfo.model ?? "",
    firmwareVersion: sdkInfo.firmwareVersion ?? sdkInfo.fw_version ?? "",
  };
}

/**
 * Clears the CDF-side ncfg baseline for one node (call with SDK marker clear).
 * @param nodeId - Node id to drop.
 */
export function clearCdfProjectedNcfg(nodeId: string): void {
  cdfProjectedNcfgByNodeId.delete(nodeId);
}

/**
 * Clears every CDF-side ncfg baseline (call on logout with SDK marker clear).
 */
export function clearAllCdfProjectedNcfg(): void {
  cdfProjectedNcfgByNodeId.clear();
}

/**
 * Mirrors CDF property changes onto the raw `ESPRMNeoNode` (param values,
 * display names, discovery-managed local transport only — mqtt stays
 * SDK-managed from connectivity).
 * @param rawNode - Mutable SDK node backing the CDF entity.
 * @param cdfNode - Live CDF node whose derived fields stay in sync.
 * @returns Callback registered via `cdfNode.onPropertyChange`.
 */
export function createPropertyChangeSyncCallback(
  rawNode: ESPRMNeoNode,
  cdfNode: ESPCDFNode,
): ESPCDFPropertyChangeCallback {
  return (event: ESPCDFPropertyChangeEvent) => {
    switch (event.type) {
      case ESPRMNEO_CDF_PROP_CHANGE.DEVICE_PARAM: {
        const device = rawNode.devices?.find(
          (candidate) => candidate.name === event.deviceName,
        );
        const param = device?.params?.find(
          (candidate) => candidate.id === event.paramName,
        );
        if (!param) {
          break;
        }
        param.value = event.value;
        if (param.type === ESPRMNEO_NAME_PARAM_TYPE) {
          syncCdfDeviceDisplayName(cdfNode, event.deviceName);
        }
        break;
      }
      case ESPRMNEO_CDF_PROP_CHANGE.METADATA:
        for (const device of cdfNode.devices ?? []) {
          syncCdfDeviceDisplayName(cdfNode, device.name);
        }
        break;
      case ESPRMNEO_CDF_PROP_CHANGE.AVAILABLE_TRANSPORTS: {
        // CDF store is SoT for LAN discovery; project only `local` onto `_raw`.
        const localMetadata =
          event.availableTransports?.[ESPCDFNodeTransport.LOCAL]?.metadata;
        const localBaseUrl = localMetadata?.baseUrl;
        if (typeof localBaseUrl === "string" && localBaseUrl) {
          // Carry the whole metadata bag, not just baseUrl: discovery also tags
          // the local-control `protocol` (and `capabilities`) there, and the SDK
          // picks its local transport implementation from that tag.
          rawNode.addTransport(ESPTransportMode.local, {
            type: ESPTransportMode.local,
            metadata: { ...localMetadata, baseUrl: localBaseUrl },
          });
        } else {
          rawNode.removeTransport(ESPTransportMode.local);
        }
        break;
      }
      default:
        break;
    }
  };
}

/**
 * Extracts params and online status from shadow update payload.
 * Shadow structure: { state: { reported: { params: {...}, online, ncfg_ver } } }
 */
function extractFromShadow(shadow: unknown): {
    params: Record<string, unknown> | undefined;
    isOnline: boolean;
} {
    const reported = (shadow as { state?: { reported?: { params?: Record<string, unknown>; online?: boolean } } })
        ?.state?.reported;
    return {
        params: reported?.params && typeof reported.params === "object" ? reported.params : undefined,
        // Default to true: we received an MQTT update, so device must be connected
        isOnline: reported?.online ?? true,
    };
}

/**
 * Merges incoming shadow params for refresh hooks. Neo nodes have no `params`
 * bag — base is empty unless hooks supply prior merge state via shadow only.
 */
function mergeShadowParamsForRefresh(
    shadowParams: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (!shadowParams) {
        return undefined;
    }
    const hooks = getRmneoNcfgRefreshHooks();
    const merge = hooks?.mergeShadowParams ?? defaultMergeRmneoShadowParams;
    return merge({}, shadowParams);
}

/**
 * Fetches fresh node config via getNodeDetails and replaces in store.
 * Uses addNode (via applyRefreshedCdfNodeToStore) which properly re-attaches
 * the CDF synchronizer for devices/params - matching the provision/sync pattern.
 *
 * MQTT lifecycle is owned by the Neo SDK (no adaptor cleanup / node.params writes).
 * @param shadowParams - Params from the shadow update that triggered this refresh.
 * @param isOnline - Whether the device is online (from the shadow update).
 */
async function performNodeConfigRefresh(
    nodeId: string,
    shadowParams: Record<string, unknown> | undefined,
    isOnline: boolean,
): Promise<void> {
    const hooks = getRmneoNcfgRefreshHooks();
    hooks?.onRefreshStart?.(nodeId);

    const root = ESPCDF.instance;
    const storeNode = root?.nodeStore?.getNodeById?.(nodeId);

    const user = getRmneoStackAuthorizationUser(root);
    if (!user) {
        return;
    }

    const oldRaw = storeNode?._raw as ESPRMNeoNode | undefined;
    const oldConnectivityStatus = oldRaw?.connectivityStatus;
    const mergedShadowParams = mergeShadowParamsForRefresh(shadowParams);

    if (mergedShadowParams && Object.keys(mergedShadowParams).length > 0) {
        hooks?.onShadowParamsMerged?.(nodeId, mergedShadowParams);
    }

    const refreshCtx = {
        nodeId,
        shadowParams,
        oldRaw,
        mergedShadowParams,
    };

    try {
        const cdfNode = await user.getNodeDetails(nodeId);
        applyRefreshedCdfNodeToStore(cdfNode);

        const newStoreNode = root?.nodeStore?.getNodeById?.(nodeId);
        const newRaw = newStoreNode?._raw as ESPRMNeoNode | undefined;

        const newConnectivityStatus = {
            isConnected: isOnline || oldConnectivityStatus?.isConnected || true,
            lastConnectionTimestamp:
                oldConnectivityStatus?.lastConnectionTimestamp ?? Date.now(),
        };

        runInAction(() => {
            if (newStoreNode) {
                newStoreNode.connectivityStatus = newConnectivityStatus;
            }
            if (newRaw) {
                newRaw.connectivityStatus = newConnectivityStatus;
            }
        });

        try {
            await EspLocalDiscoveryAdapter.stopDiscovery();
            await EspLocalDiscoveryAdapter.startDiscovery(() => {}, {
                serviceType: MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
                domain: MDNS_DOMAIN_LOCAL,
            });
        } catch {
            // Local discovery restart failure is non-critical
        }

        const refreshedNode = root?.nodeStore?.getNodeById?.(nodeId);
        await hooks?.onRefreshComplete?.({
            ...refreshCtx,
            refreshedNode,
        });
    } catch {
        // getNodeDetails failure is handled by not updating the store
    }
}

/**
 * Rebuilds the CDF node when shadow `ncfg_ver` changes vs the last version
 * already projected into the store.
 *
 * SDK owns raw `sync()` and storage markers. This uses an adaptor-local baseline
 * so CDF schema refresh does not race `hasNcfgVersionChanged`.
 * @param nodeId - Node whose CDF schema may be stale.
 * @param shadow - AWS IoT shadow document carrying `ncfg_ver`.
 */
export async function refreshRmneoCdfIfNcfgAheadOfStore(
    nodeId: string,
    shadow: unknown,
): Promise<void> {
    const shadowDoc = shadow as ESPRMNeoShadowDocument;
    const ncfg = getNcfgVersion(shadowDoc);
    if (ncfg == null) {
        return;
    }

    const prev = cdfProjectedNcfgByNodeId.get(nodeId);
    // First sighting → baseline only (mirrors SDK marker behavior).
    if (prev === undefined) {
        cdfProjectedNcfgByNodeId.set(nodeId, ncfg);
        return;
    }
    if (prev === ncfg) {
        return;
    }

    const { params, isOnline } = extractFromShadow(shadow);
    await performNodeConfigRefresh(nodeId, params, isOnline);
    cdfProjectedNcfgByNodeId.set(nodeId, ncfg);
}
const inflightByNodeId = new Map<string, Promise<void>>();

/**
 * Runs shadow-side ncfg work once per node while duplicate MQTT handlers are active.
 * @returns `true` for the leader (may emit CDF updates); `false` for waiters.
 */
export async function runNcfgShadowHandlerCoalesced(
    nodeId: string,
    work: () => Promise<void>,
): Promise<boolean> {
    const existing = inflightByNodeId.get(nodeId);
    if (existing) {
        await existing;
        return false;
    }

    const promise = work().finally(() => {
        inflightByNodeId.delete(nodeId);
    });
    inflightByNodeId.set(nodeId, promise);
    await promise;
    return true;
}
function syncGroupNodeDetails(
    groups: ESPCDFGroup[] | undefined,
    nodeId: string,
    node: ESPCDFNode,
): void {
    if (!groups?.length) return;

    const root = ESPCDF.instance;
    for (const group of groups) {
        if (group.nodeIds?.includes(nodeId)) {
            const detailsById = new Map((group.nodeDetails ?? []).map((n) => [n.id, n]));
            detailsById.set(nodeId, node);
            const nodeDetails = Array.from(detailsById.values());
            group.nodeDetails = nodeDetails;
            root?.groupStore?.updateGroup?.(group.id, { nodeDetails });
        }
        if (group.subGroups?.length) {
            syncGroupNodeDetails(group.subGroups, nodeId, node);
        }
    }
}

/**
 * Replaces a CDF node in the store using addNode (which properly re-attaches
 * the CDF synchronizer for devices/params). Preserves local transport via
 * the same merge used in provision/sync flows, falling back to the existing
 * store node's raw SDK `availableTransports` for the LAN base URL.
 */
export function applyRefreshedCdfNodeToStore(cdfNode: ESPCDFNode): void {
    const root = ESPCDF.instance;
    const nodeStore = root?.nodeStore;
    if (!nodeStore) return;

    // Merge local transport from existing store node
    const registered =
        root?.subscriptionStore?.getRegisteredTransportsSnapshot?.() ?? {};
    const merged = mergeLocalTransportFromNodeMap(
        [cdfNode],
        nodeStore.nodesByIDMap,
        registered,
    )[0];

    const mergedTransports = merged.availableTransports as Record<string, unknown> | undefined;
    const mergedLocalBaseUrl = (mergedTransports?.local as { metadata?: { baseUrl?: string } })?.metadata?.baseUrl;

    // Fallback: if the CDF merge didn't carry a local transport, read it from the
    // existing store node's raw SDK instance (the live ESPRMNeoNode that local
    // discovery applied via addTransport). The new SDK has no global
    // node-baseUrl map (ESPRMNeoBase.getNodeBaseUrl was removed) — the LAN
    // transport now lives per-node on availableTransports.
    if (!mergedLocalBaseUrl) {
        const existingRaw = nodeStore.getNodeById(cdfNode.id)?._raw as
            | {
                availableTransports?: Record<
                    string,
                    { metadata?: Record<string, unknown> & { baseUrl?: string } }
                >;
            }
            | undefined;
        const rawLocalMetadata =
            existingRaw?.availableTransports?.[ESPCDFNodeTransport.LOCAL]?.metadata;
        const rawBaseUrl = rawLocalMetadata?.baseUrl;
        if (rawBaseUrl) {
            // Preserve the local-control `protocol` tag alongside baseUrl — the SDK
            // selects its local transport implementation from it.
            const localCfg = {
                type: ESPCDFNodeTransport.LOCAL,
                metadata: { ...rawLocalMetadata, baseUrl: rawBaseUrl },
            };
            merged.availableTransports = {
                ...merged.availableTransports,
                [ESPCDFNodeTransport.LOCAL]: localCfg,
            };
            // Mirror onto the refreshed raw node so the SDK still routes local.
            const raw = merged._raw as
                | { availableTransports?: Record<string, unknown> }
                | undefined;
            if (raw && typeof raw === "object") {
                raw.availableTransports = {
                    ...(raw.availableTransports || {}),
                    [ESPCDFNodeTransport.LOCAL]: localCfg,
                };
            }
        }
    }

    // A rebuild's source data (cloud config, local Matter topology, etc.) can
    // momentarily be a subset of what the UI already showed - e.g. right after
    // first-time commissioning, before the cloud config has caught up with
    // every param the device reports (RMHOME-168). Never let a refresh shrink
    // the param list the UI already had for a device.
    const existingNode = nodeStore.getNodeById(cdfNode.id);
    if (existingNode?.devices?.length && merged.devices?.length) {
        mergeMissingDeviceParams(merged.devices, existingNode.devices);
    }

    runInAction(() => {
        const stored = nodeStore.addNode(merged);
        syncGroupNodeDetails(root?.groupStore?.groupsList, stored.id, stored);
    });
    kickMatterLocalDiscoveryAfterNodesInStore();
}
/** Field-level param merge — avoids replacing the whole param object on live updates. */
export function mergeParamFields(
    existingParam: Record<string, unknown>,
    incoming: unknown,
): void {
    if (existingParam == null || incoming === undefined) return;
    if (typeof incoming !== "object" || incoming === null || Array.isArray(incoming)) {
        existingParam.value = incoming;
        return;
    }
    for (const key of Object.keys(incoming as Record<string, unknown>)) {
        existingParam[key] = (incoming as Record<string, unknown>)[key];
    }
}

/**
 * Preserves param values already present in `sourceDevices` onto matching
 * (by device name + param name) params in `targetDevices`. Used to stop a
 * freshly rebuilt node (e.g. from a cloud config GET, which carries schema
 * but not live values) from blanking out values a live shadow/subscription
 * update already applied to the node currently in the store.
 */
export function mergeDeviceParamValues(
    targetDevices: ESPCDFDevice[],
    sourceDevices: ESPCDFDevice[],
): void {
    runInAction(() => {
        for (const srcDevice of sourceDevices) {
            const tgtDevice = targetDevices.find(
                (d) => (d.name ?? "") === (srcDevice.name ?? ""),
            );
            if (!tgtDevice?.params?.length) continue;
            for (const srcParam of srcDevice.params ?? []) {
                const name = srcParam.name ?? "";
                if (!name) continue;
                const tgtParam = tgtDevice.params.find((p) => (p.name ?? "") === name);
                if (tgtParam && srcParam.value !== undefined) {
                    mergeParamFields(
                        tgtParam as unknown as Record<string, unknown>,
                        srcParam.value,
                    );
                }
            }
        }
    });
}

/**
 * Applies a raw shadow/`getParams()`-shaped params object
 * (`{ [deviceName]: { [paramName]: value } }`) onto matching (by device name +
 * param name) params in `devices`. Non-matching top-level keys (e.g.
 * `"Local Control"`, which isn't a real UI device) are naturally skipped since
 * no device with that name exists.
 *
 * Used right after provisioning: the node's CDF devices are built from the
 * cloud's schema-only config (no live values), and a follow-up MQTT
 * `getParams()` fetches the device's actual reported values into the raw SDK
 * node's params — but that alone never reaches the CDF param values the UI
 * reads, so the UI kept showing whatever default the schema fetch produced
 * (e.g. `Power: false`) until an unrelated later resync happened to refresh it.
 */
export function applyRawParamsToDeviceValues(
    devices: ESPCDFDevice[],
    rawParams: Record<string, unknown> | undefined,
): void {
    if (!rawParams) return;
    runInAction(() => {
        for (const deviceName of Object.keys(rawParams)) {
            const deviceParams = rawParams[deviceName];
            if (typeof deviceParams !== "object" || deviceParams === null) continue;
            const tgtDevice = devices.find((d) => (d.name ?? "") === deviceName);
            if (!tgtDevice?.params?.length) continue;
            for (const paramName of Object.keys(deviceParams as Record<string, unknown>)) {
                const value = (deviceParams as Record<string, unknown>)[paramName];
                if (value === undefined) continue;
                const tgtParam = tgtDevice.params.find((p) => (p.name ?? "") === paramName);
                if (tgtParam) {
                    mergeParamFields(tgtParam as unknown as Record<string, unknown>, value);
                }
            }
        }
    });
}

/**
 * Adds params from `sourceDevices` that are entirely missing (by name) from
 * the matching device in `targetDevices`. Used so a rebuild whose source data
 * is momentarily incomplete (e.g. a hybrid Matter node rebuilt right after
 * commissioning, before the cloud config has caught up with every param the
 * device reports) can only add to the schema the UI already showed, never
 * shrink it. Existing params in `targetDevices` are left untouched.
 */
export function mergeMissingDeviceParams(
    targetDevices: ESPCDFDevice[],
    sourceDevices: ESPCDFDevice[],
): void {
    runInAction(() => {
        for (const srcDevice of sourceDevices) {
            const tgtDevice = targetDevices.find(
                (d) => (d.name ?? "") === (srcDevice.name ?? ""),
            );
            if (!tgtDevice) continue;
            tgtDevice.params = tgtDevice.params ?? [];
            for (const srcParam of srcDevice.params ?? []) {
                const name = srcParam.name ?? "";
                if (!name) continue;
                const exists = tgtDevice.params.some((p) => (p.name ?? "") === name);
                if (!exists) tgtDevice.params.push(srcParam);
            }
        }
    });
}

/**
 * Preserves a raw SDK node's live `params` (e.g. the local-control PoP) onto a
 * freshly rebuilt raw node whose `params` came from a schema-only cloud config
 * GET. `ESPRMNeoNode.applyNodeConfig` already merges config params under its own
 * live params (`{...config.params, ...this.params}`), but that only protects
 * re-syncs of the *same* node instance. A resync that constructs a brand-new
 * `ESPRMNeoNode` (e.g. `buildMatterCdfNodesFromGroup` refetching from the group)
 * starts that instance's `params` from empty, so without this merge the PoP
 * (and any other live-only param) is dropped and local control's SEC1 handshake
 * fails right after provisioning.
 *
 * Deliberately only one level of recursion: fills in a missing top-level key
 * (e.g. `"Local Control"` entirely missing) or a missing nested key within a
 * key present on both sides (e.g. `target.params["Local Control"]` exists as
 * `{}` from the schema-only fetch, but is missing `POP`) — it never overwrites
 * a value `target` already has. A flat/shallow merge is NOT enough here: the
 * schema-only fetch commonly already has the `"Local Control"` key present
 * (just empty), so a top-level-only merge would let that empty object win
 * outright and still drop `POP`.
 */
export function mergeRawNodeParams(
    target: { params: Record<string, unknown> } | undefined,
    source: { params?: Record<string, unknown> } | undefined,
): void {
    if (!target || !source?.params) return;
    for (const key of Object.keys(source.params)) {
        const srcVal = source.params[key];
        const tgtVal = target.params[key];
        if (tgtVal === undefined || tgtVal === null) {
            target.params[key] = srcVal;
            continue;
        }
        if (
            typeof srcVal === "object" && srcVal !== null && !Array.isArray(srcVal) &&
            typeof tgtVal === "object" && tgtVal !== null && !Array.isArray(tgtVal)
        ) {
            for (const subKey of Object.keys(srcVal as Record<string, unknown>)) {
                if ((tgtVal as Record<string, unknown>)[subKey] === undefined) {
                    (tgtVal as Record<string, unknown>)[subKey] = (srcVal as Record<string, unknown>)[subKey];
                }
            }
        }
    }
}
/**
 * Mirrors CDF `availableTransports` onto the backing RMNeo SDK node so
 * delegated transport selection can use LAN control.
 */
export function syncAvailableTransportsToRmneoSdkNode(
    rawNode: ESPRMNeoNode,
    availableTransports: Record<string, ESPCDFTransportConfig> | undefined,
): void {
    const nextTransports = availableTransports ?? {};

    for (const mode of Object.keys(rawNode.availableTransports ?? {})) {
        if (!nextTransports[mode]) {
            rawNode.removeTransport(mode);
        }
    }

    for (const [mode, config] of Object.entries(nextTransports)) {
        if (config) {
            rawNode.addTransport(mode, config);
        }
    }
}
