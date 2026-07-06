/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDFNode,
    ESPCDF,
    ESPCDFNodeConfig,
    ESPCDFNodeInfoInterface,
    ESPCDFAPIResponse,
    ESPCDFNodeTransport,
} from "@store";
import {
    ESPRMNGBase,
    ESPRMNGDevice,
    ESPRMNGNode,
    ESPRMNGService,
    ESPTransportMode,
    type ESPNodeUpdateData,
} from "@espressif/rmng-base-sdk";
import type {
    ESPCDFNodeOperation,
    ESPCDFPropertyChangeCallback,
    ESPCDFPropertyChangeEvent,
} from "@store";
import { syncCdfDeviceDisplayName } from "@sdk-adaptors/shared/utils/common";
import { tryFactoryResetBeforeDelete } from "@sdk-adaptors/shared/utils/factoryReset";
import { projectRegisteredTransportsOntoRawNode } from "@sdk-adaptors/shared/utils/projectRegisteredTransports";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import {
    ESPRM_NAME_PARAM_TYPE,
    HEADLESS_ERROR_UNKNOWN,
} from "@shared/utils/constants";
import {
    EVENT_NODE_CONNECTED,
    EVENT_NODE_DISCONNECTED,
} from "@store";
import { mapShadowDocumentToNodeUpdateEvents, emitShadowConnectivityEvents, normalizeRmngSdkResponseToCdf } from "../utils/common";
import { mapNodeUpdateDataToEvent } from "@shared/utils/subscriptionHelper";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { refreshRmngNodeIfShadowNcfgVersionChanged } from "../utils/rmngNcfgVersionShadowRefresh";
import { runNcfgShadowHandlerCoalesced } from "../utils/rmngNcfgShadowCoalesce";
import { transformToESPCDFDevice } from "./transformToESPCDFDevice";
import { transformToESPCDFService } from "./transformToESPCDFService";
import { ianaTzToEspPosixTz } from "@shared/utils/timezone";

/** @see TransformRmngNodeOptions in ESPRMNGMatterBase/buildRmngMatterCdfNode */
export type TransformRmngNodeOptions = unknown;

const MQTT_TRANSPORT_KEY = "mqtt";

/**
 * Ensures only one store-sink subscription exists per `nodeId`.
 *
 * During node re-transformation (e.g. after sync or NCFG processing), the
 * existing subscription is replaced rather than creating an additional one.
 * This is required because SDK subscription channels are singletons keyed by
 * `nodeId` and outlive individual node instances, unlike the legacy
 * `node.on("params")` emitter.
 */
const rmngNodeUpdateHandlers = new Map<string, (update: ESPNodeUpdateData) => void>();

/**
 * Syncs CDF display names on property changes and mirrors name-param values on the raw node.
 * @param rawNode - Mutable SDK node backing the CDF entity.
 * @param cdfNode - Live CDF node whose derived fields stay in sync.
 * @returns Callback registered on the CDF node for property change events.
 */
const createPropertyChangeSyncCallback = (
    rawNode: ESPRMNGNode,
    cdfNode: ESPCDFNode,
): ESPCDFPropertyChangeCallback => {
    return (event: ESPCDFPropertyChangeEvent) => {
        switch (event.type) {
            case "deviceParamChanged": {
                const device = rawNode.devices?.find(
                    (candidate) => candidate.id === event.deviceName,
                );
                if (device) {
                    const param = device.params?.find(
                        (candidate) => candidate.id === event.paramName,
                    );
                    if (param) {
                        param.value = event.value;
                        if (param.type === ESPRM_NAME_PARAM_TYPE) {
                            syncCdfDeviceDisplayName(cdfNode, event.deviceName);
                        }
                    }
                }
                break;
            }
            case "metadataChanged":
                for (const device of cdfNode.devices ?? []) {
                    syncCdfDeviceDisplayName(cdfNode, device.name);
                }
                break;
            case "availableTransportsChanged": {
                // Mirror the CDF-managed LAN transport onto the raw RMNG node so the
                // SDK's transport handler routes local-first for subsequent set/get
                // params. The CDF store is the single source of truth (updated by
                // `handleNodeTransportUpdate` from local discovery); this projects it
                // onto `_raw`. Unlike the legacy adaptor we do NOT blanket-replace
                // `rawNode.availableTransports`: the RMNG node self-manages its
                // `mqtt` transport from connectivity, so we touch only the
                // discovery-managed `local` transport via the node's generic
                // addTransport/removeTransport helpers. The event carries the full
                // transport map, so absence of `local` means it was removed (service lost).
                const localBaseUrl =
                    event.availableTransports?.[ESPCDFNodeTransport.LOCAL]?.metadata
                        ?.baseUrl;
                if (typeof localBaseUrl === "string" && localBaseUrl) {
                    rawNode.addTransport(ESPTransportMode.local, {
                        type: ESPTransportMode.local,
                        metadata: { baseUrl: localBaseUrl },
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
};

/**
 * Transforms one RMNG SDK node into a CDF node with resilient device/service mapping.
 * Malformed devices or services are skipped so the node still renders when the payload is partial.
 * @param node - Raw RMNG SDK node.
 * @returns Transformed CDF node.
 */
/** Pure RMNG node → CDF transform (no Matter imports or routing). */
export function transformToESPCDFNodeBase(
    node: ESPRMNGNode,
): ESPCDFNode {
    const nodeId = node.nodeId;
    const operations: ESPCDFNodeOperation = {
        setMultipleParams: async (_params: Record<string, any>) => {
            const res = await node.setParams(_params);
            return normalizeRmngSdkResponseToCdf(res, "Parameters updated successfully");
        },
        delete: async (): Promise<ESPCDFAPIResponse> => {
            // Tell the firmware to forget its provisioning before unassociating
            // from the cloud, so the device can be re-onboarded. Best-effort.
            await tryFactoryResetBeforeDelete(node.services);
            const res = await node.delete();
            return normalizeRmngSdkResponseToCdf(res, "Node deleted successfully");
        },
        setTimeZone: async (_timeZone: string) => {
            const posix = ianaTzToEspPosixTz(_timeZone);
            const timePayload: Record<string, string> = { TZ: _timeZone };
            if (posix) {
                timePayload["TZ-POSIX"] = posix;
            }
            const res = await node.setParams({
                Time: timePayload,
            });
            return normalizeRmngSdkResponseToCdf(res, "Time zone updated successfully");
        },
        updateMetadata: async (_metadata: Record<string, any>) => {
            throw new Error("RMNGBase SDK does not support node updateMetadata");
        },
        checkOTAUpdate: async () => {
            throw new Error("RMNGBase SDK does not support node checkOTAUpdate");
        },
        pushOTAUpdate: async (_params: any) => {
            throw new Error("RMNGBase SDK does not support node pushOTAUpdate");
        },
        getOTAUpdateStatus: async () => {
            throw new Error("RMNGBase SDK does not support node getOTAUpdateStatus");
        },
    };

    // Receive this node's parameter updates through the SDK subscription channel
    // (ESPRMNGSubscriptionManager → MQTT channel → orchestrator) instead of the
    // raw `node.on("params")` event. The node already self-subscribes for its own
    // state; this registers the CDF store sink as an additional subscriber, and
    // the channel deduplicates the underlying MQTT subscription per shadow.
    const handleNodeUpdate = (update: ESPNodeUpdateData) => {
        const root = ESPCDF.instance;
        const listen = root?.subscriptionStore?.nodeUpdates?.listen;
        if (!listen) return;

        // MQTT updates carry the full raw shadow in `metadata.shadow`; use it for
        // connectivity/params extraction and ncfg-version refresh, exactly as the
        // previous `node.on("params")` path did. Channels that don't provide a raw
        // shadow (e.g. a future Matter channel) fall back to the normalized payload.
        const shadow = update.metadata?.shadow;
        const isShadowDoc =
            !!shadow &&
            typeof shadow === "object" &&
            (shadow as { state?: { reported?: unknown } }).state?.reported !==
                undefined;

        if (isShadowDoc) {
            void (async () => {
                emitShadowConnectivityEvents(node.nodeId, shadow, listen);

                const isPrimary = await runNcfgShadowHandlerCoalesced(update.nodeId, async () => {
                    try {
                        await refreshRmngNodeIfShadowNcfgVersionChanged(update.nodeId, shadow);
                    } catch (err) {
                        console.warn(
                            `[ncfg_ver][app] refreshRmngNodeIfShadowNcfgVersionChanged failed nodeId=${update.nodeId}`,
                            err,
                        );
                    }
                });
                if (!isPrimary) return;

                const events = mapShadowDocumentToNodeUpdateEvents(update.nodeId, shadow);
                for (const ev of events) {
                    if (
                        ev.event_type === EVENT_NODE_CONNECTED ||
                        ev.event_type === EVENT_NODE_DISCONNECTED
                    ) {
                        continue;
                    }
                    listen(ev);
                }
            })();
            return;
        }

        listen(mapNodeUpdateDataToEvent(update));
    };

    try {
        const manager = ESPRMNGBase.subscriptionManager;
        // Drop any prior store-sink subscription for this node before adding the
        // new one, so re-transforms don't deliver to the store multiple times.
        const previous = rmngNodeUpdateHandlers.get(node.nodeId);
        if (previous) {
            void manager.unsubscribeFromNode(node.nodeId, previous).catch(() => {});
        }
        rmngNodeUpdateHandlers.set(node.nodeId, handleNodeUpdate);

        manager.subscribeToNode(node, handleNodeUpdate).catch((err) => {
            console.warn(
                `[rmng] subscriptionManager.subscribeToNode failed nodeId=${node.nodeId}`,
                err,
            );
        });
    } catch (err) {
        console.warn(`[rmng] subscriptionManager unavailable nodeId=${node.nodeId}`, err);
    }

    const devices = safeTransform<ESPRMNGDevice, ReturnType<typeof transformToESPCDFDevice>>(
        node.devices,
        "node.devices",
        (device) => transformToESPCDFDevice(device),
        ({ index, error }) => {
            const message = error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
            console.warn("Node device transform skipped", {
                nodeId,
                index,
                reason: message,
            });
        },
        { skipElement: (device) => !device },
    );

    const services = safeTransform<ESPRMNGService, ReturnType<typeof transformToESPCDFService>>(
        node.services,
        "node.services",
        (service) => transformToESPCDFService(service),
        ({ index, error }) => {
            const message = error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
            console.warn("Node service transform skipped", {
                nodeId,
                index,
                reason: message,
            });
        },
        { skipElement: (service) => !service },
    );

    const cdfNode = new ESPCDFNode({
        identifier: ESPRMNGBaseAdaptorIdentifier,
        id: node.nodeId,
        type: "rmng node",
        nodeConfig: new ESPCDFNodeConfig({
            configVersion: node.config.config_version ?? "",
            info: node.config.info as ESPCDFNodeInfoInterface,
        }),
        devices,
        services,
        connectivityStatus: node.connectivityStatus,
        metadata: {},
        operations: operations,
        isPrimaryUser: true, // TODO: Remove this once we have a proper way to determine if the node is primary user
        transportOrder: [ESPTransportMode.local, MQTT_TRANSPORT_KEY],
        availableTransports: {
            [MQTT_TRANSPORT_KEY]: { type: MQTT_TRANSPORT_KEY, metadata: {} },
        },
        _raw: node,
    });
    const syncCallback = createPropertyChangeSyncCallback(node, cdfNode);
    cdfNode.onPropertyChange(syncCallback);

    // Re-project the durable registered LAN transport onto this freshly-built raw
    // node so `node.setParams` routes local-first immediately — a new instance
    // (home sync or ncfg shadow refresh) otherwise seeds only `mqtt` and routes
    // over MQTT until a home switch re-subscribes discovery. See the helper for
    // the full rationale.
    projectRegisteredTransportsOntoRawNode(
        node,
        ESPCDF.instance?.subscriptionStore?.getRegisteredTransportsSnapshot?.()?.[
            nodeId
        ],
    );

    return cdfNode;
}

/** Pure RMNG node transform — used by base adaptor and Matter gate fallback. */
export function transformToESPCDFNode(
    node: ESPRMNGNode,
    _options?: TransformRmngNodeOptions,
): ESPCDFNode {
    return transformToESPCDFNodeBase(node);
}

/**
 * Transforms a batch of RMNG SDK nodes to CDF nodes.
 * Invalid nodes are skipped and reported as partial failures.
 * @param nodes - Raw SDK nodes.
 * @param context - Context label for partial failure logs.
 * @returns Successfully transformed CDF nodes.
 */
export function transformToESPCDFNodes(
    nodes: ESPRMNGNode[],
    context: string,
    options?: TransformRmngNodeOptions,
): ESPCDFNode[] {
    const failures: { nodeId: string; index: number; reason: string }[] = [];

    const transformedNodes = safeTransform<ESPRMNGNode, ESPCDFNode>(
        nodes,
        context,
        (n) => transformToESPCDFNode(n, options),
        ({ index, context: ctx, error }) => {
            const message = error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
            failures.push({
                nodeId: nodes[index]?.nodeId ?? "",
                index,
                reason: `${ctx}: ${message}`,
            });
        },
    );

    if (failures.length > 0) {
        console.warn("Node transform partial failures", failures);
    }

    return transformedNodes;
}
