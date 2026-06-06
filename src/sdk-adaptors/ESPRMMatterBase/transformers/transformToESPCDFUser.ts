/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";
import { transformToESPCDFUser as transformToESPCDFUserBase } from "@sdk-adaptors/ESPRMBase/transformers/transformToESPCDFUser";
import { ESPMatterUtilityAdapter } from "@native-adaptors/implementations/ESPMatterUtilityAdapter";
import {
    MDNS_DOMAIN_LOCAL,
    MATTER_LOCAL_DISCOVERY_EVENT,
    MATTER_LOCAL_DISCOVERY_LOST_EVENT,
    MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
} from "@shared/utils/constants";
import { mapNodeUpdateDataToEvent } from "@shared/utils/subscriptionHelper";
import { registerSubscribeRetryForUser } from "@shared/utils/matterSubscribeRetry";
import { registerAttributeReadForUser } from "@shared/utils/matterAttributeRead";
import {
    ESPCDFGroup,
    ESPCDFMatterPrecommissionInfo,
    ESPCDFSubscribeToNodeUpdatesRequestParams,
    ESPCDFUser,
    ESPCDFPaginatedAPIResponse,
    GroupStoreCallbacks,
} from "@store";
import {
    ESPNodeUpdateData,
    ESPRMBase,
    ESPRMNode,
} from "@espressif/rainmaker-base-sdk";
import {
    type ESPMatterDiscoveryParamsInterface,
    ESPRMMatterBase,
    ESPRMMatterEventType,
    ESPRMUser,
    getClusterRegistryEntry,
} from "@espressif/rainmaker-matter-sdk";
import { ESPRMMatterBaseAdaptorIdentifier } from "../constants";
import {
    fetchAllMatterFabricGroups,
    getMatterGroupById,
    syncHomeWithNodes as matterSyncHomeWithNodes,
    transformMatterSdkGroupsPageToCdf,
} from "../groupSync";
import { ensureMatterInChannelOrder } from "./matterChannelOrder";
import { rewriteMatterShadowPayload } from "./matterSubscriptionRouting";

interface MatterDiscoverySubscribeConfig {
    serviceType?: string;
    domain?: string;
}

/**
 * Resolves CDF event string to Matter SDK event enum when applicable.
 * @param event - CDF layer event key passed by features/hooks.
 * @returns Matter event type for discovery events, otherwise the original event.
 */
function resolveMatterEventType(event: string): string {
    if (event === MATTER_LOCAL_DISCOVERY_EVENT) {
        return ESPRMMatterEventType.matterLocalDiscovery;
    }
    if (event === MATTER_LOCAL_DISCOVERY_LOST_EVENT) {
        return ESPRMMatterEventType.matterLocalDiscoveryLost;
    }
    return event;
}

/**
 * Converts optional partial discovery config into SDK-compatible config.
 * @param config - Optional incoming config from CDF layer.
 * @returns Normalized Matter discovery config or `undefined`.
 */
function resolveMatterDiscoveryConfig(
    config?: MatterDiscoverySubscribeConfig,
): ESPMatterDiscoveryParamsInterface | undefined {
    if (!config) {
        return undefined;
    }
    return {
        serviceType: config.serviceType ?? MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
        domain: config.domain ?? MDNS_DOMAIN_LOCAL,
    };
}

/**
 * RainMaker + Matter: delegate to ESPRMBase user transformation, then attach Matter-only
 * operations (fabrics, NOC, precommission storage) and mark the CDF user with this adaptor id.
 *
 * Subscription handling is OVERRIDDEN here (rather than decorating the base impl)
 * because the matter-aware shadow-payload rewrite needs the raw
 * `ESPNodeUpdateData.metadata` (clusterId/endpointId/attributeId) which the
 * base-level `mapNodeUpdateDataToEvent` strips before invoking the caller's
 * `onNodeUpdate`. Replacing the op keeps the matter SDK out of the base
 * adaptor entirely (`ESPRMBase` has zero matter-sdk imports) while still
 * routing both RainMaker cloud notifications and matter subscription frames
 * — `subscriptionManager.subscribeToAllNodes` fans out across every
 * registered channel, so the single matter-aware handler installed here
 * receives updates from any source.
 */
export function transformToESPCDFUser(esprmUser: ESPRMUser | null): ESPCDFUser {
    if (!esprmUser) {
        throw new Error("ESPRMUser is required for transformation");
    }

    const subscribedNodeIdList: string[] = [];

    /**
     * Captures the most recent `subscribeToNodeUpdates` invocation so the
     * matter retry helper can replay subscriptions for a single node when
     * its channel set changes (e.g. Matter local discovery attaches a
     * `matter_local` transport after the initial subscribe-all already
     * failed with `No available subscription channels`).
     */
    let lastSubscribeUpdateHandler:
        | ((update: ESPNodeUpdateData) => void)
        | null = null;
    /**
     * Latest reference to the SDK node list provided by the application.
     * Updated on every subscribeToNodeUpdates call so retries can resolve a
     * freshly-rebuilt `_raw` `ESPRMNode` for a given node id, and so the
     * shadow rewriter can locate the param matching an update's
     * (clusterId, endpointId, attributeId) triplet.
     */
    let lastSubscribeSdkNodes: ESPRMNode[] = [];

    const matterOperations = {
        async getGroups(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>> {
            const response = await esprmUser.getGroups({
                withNodeList: true,
                withSubGroups: true,
            });
            return transformMatterSdkGroupsPageToCdf(esprmUser, response);
        },
        async getGroupsAndFabrics(): Promise<ESPCDFGroup[]> {
            return fetchAllMatterFabricGroups(esprmUser);
        },
        /**
         * Overrides base home sync: fetches homes, rooms, and nodes through Matter SDK only
         * (`ESPRMMatterBase/groupSync.syncHomeWithNodes`).
         */
        async syncHomeWithNodes(
            user: ESPCDFUser,
            callbacks: GroupStoreCallbacks,
        ) {
            return matterSyncHomeWithNodes(user, callbacks, esprmUser);
        },
        async getGroupById(groupId: string, options: Record<string, unknown>) {
            return getMatterGroupById(esprmUser, groupId, options);
        },

        async isUserNocAvailableForFabric(fabricId: string): Promise<boolean> {
            return ESPMatterUtilityAdapter.isUserNocAvailableForFabric(fabricId);
        },

        async storePrecommissionInfo(info: ESPCDFMatterPrecommissionInfo): Promise<void> {
            return ESPMatterUtilityAdapter.storePrecommissionInfo(info);
        },
        /**
         * Subscribes through Matter SDK event types so discovery subscriptions
         * trigger Matter browse sessions for the Matter domain.
         * @param event - CDF-level event key.
         * @param callback - Callback invoked on each event payload.
         * @param config - Optional discovery browse configuration.
         */
        async subscribeToEvent(
            event: string,
            callback: (event: unknown) => void,
            config?: MatterDiscoverySubscribeConfig,
        ): Promise<void> {
            const matterEvent = resolveMatterEventType(event);
            const discoveryConfig = resolveMatterDiscoveryConfig(config);
            esprmUser.subscribe(matterEvent, callback, discoveryConfig);
        },
        /**
         * Unsubscribes using Matter SDK event types so the correct Matter
         * discovery listeners are removed.
         * @param event - CDF-level event key.
         * @param callback - Callback to remove.
         */
        async unsubscribeFromEvent(
            event: string,
            callback: (event: unknown) => void,
        ): Promise<void> {
            const matterEvent = resolveMatterEventType(event);
            esprmUser.unsubscribe(matterEvent, callback);
        },

        async subscribeToNodeUpdates(
            params: ESPCDFSubscribeToNodeUpdatesRequestParams,
        ): Promise<void> {
            const subscriptionManager = ESPRMBase.subscriptionManager;
            const sdkNodes = params.nodeList.map(
                (node) => node._raw as ESPRMNode,
            );

            const handleNodeUpdate = (update: ESPNodeUpdateData) => {
                // Matter subscription updates arrive with a flat payload
                // keyed `cluster_<id>_attr_<id>` for clusters the matter
                // SDK's transform doesn't know (RVC, PowerSource, …). The
                // shadow-style consumer (`handleNodeParamsChanged`) can't
                // route those, so the UI never updates. Rebuild the
                // payload through the matter param's own resolver so the
                // existing pipeline applies the decoded value to the
                // matching device/param.
                //
                // Diagnostic logs (A/B/C/D) trace the matter-update routing
                // so a missed UI render can be pinpointed:
                //  A — handler invoked at all (rules out channel-instance
                //      mismatch / SDK channel-list duplication)
                //  B — `rewriteMatterShadowPayload` returned a shadow OR
                //      returned `undefined` because no param matched
                //  C — final payload shape that we hand to the CDF caller
                //      (helps verify `handleNodeParamsChanged` receives the
                //      shadow it expects)
                //  D — confirm the SDK-side device tree exposes the
                //      entityName/paramName referenced by the shadow
                console.log(
                    "[matterTransformToESPCDFUser] handleNodeUpdate A: nodeId=",
                    update.nodeId,
                    "metadata=",
                    update.metadata,
                    "payloadKeys=",
                    update.payload && typeof update.payload === "object"
                        ? Object.keys(update.payload as object)
                        : update.payload,
                );
                const shadow = rewriteMatterShadowPayload(
                    update,
                    lastSubscribeSdkNodes,
                );
                console.log(
                    "[matterTransformToESPCDFUser] handleNodeUpdate B: shadow=",
                    shadow ?? "(undefined — no param match, payload dropped by CDF)",
                );
                const routedUpdate: ESPNodeUpdateData = shadow
                    ? { ...update, payload: shadow }
                    : update;
                console.log(
                    "[matterTransformToESPCDFUser] handleNodeUpdate C: routedPayload=",
                    routedUpdate.payload,
                );
                const nodeUpdateEvent = mapNodeUpdateDataToEvent(routedUpdate);
                params.onNodeUpdate?.(nodeUpdateEvent);

                // Diagnostic D: after dispatch, confirm the SDK-side device
                // tree the CDF mirror was built from actually exposes the
                // entityName/paramName referenced by the shadow. If this
                // logs `sdkDeviceFound=false` or `sdkParamFound=false`, the
                // CDF can't route the shadow even though we built it
                // correctly — the bug is the device/param name not
                // matching what the CDF mirror has, NOT the shadow.
                if (shadow) {
                    const sdkNode = lastSubscribeSdkNodes.find(
                        (n) => n.id === update.nodeId,
                    );
                    const sdkDevices = (
                        sdkNode as unknown as {
                            nodeConfig?: {
                                devices?: {
                                    name?: string;
                                    params?: { name?: string }[];
                                }[];
                            };
                        }
                    )?.nodeConfig?.devices;
                    for (const [entityName, fields] of Object.entries(shadow)) {
                        const sdkDevice = sdkDevices?.find(
                            (d) => d?.name === entityName,
                        );
                        const sdkDeviceFound = !!sdkDevice;
                        const sdkParamNames = sdkDevice?.params
                            ?.map((p) => p?.name)
                            .filter(Boolean) as string[] | undefined;
                        for (const paramName of Object.keys(fields)) {
                            const sdkParamFound =
                                !!sdkParamNames?.includes(paramName);
                            console.log(
                                "[matterTransformToESPCDFUser] handleNodeUpdate D:",
                                "nodeId=",
                                update.nodeId,
                                "entity=",
                                entityName,
                                "param=",
                                paramName,
                                "sdkDeviceFound=",
                                sdkDeviceFound,
                                "sdkParamFound=",
                                sdkParamFound,
                                "sdkParamNames=",
                                sdkParamNames,
                            );
                        }
                    }
                }
            };

            // Capture for the matter retry helper. Recorded BEFORE the
            // initial subscribe-all so a transport added mid-flight can
            // still be retried even if the caller never re-invokes this op.
            lastSubscribeUpdateHandler = handleNodeUpdate;
            lastSubscribeSdkNodes = sdkNodes;

            // Re-assert that the Matter channel is registered AND in
            // `globalChannelOrder` immediately before kicking off
            // subscribe-to-all. The base SDK resets the order to
            // `[NOTIFICATION]` asynchronously after `configure()` runs
            // (when a `notificationAdapter` is provided), which can clobber
            // the `[MATTER, NOTIFICATION]` order set during matter SDK
            // init. We may also see a manager-instance mismatch where the
            // matter channel was registered on a different
            // `subscriptionManager` view than the one we are about to
            // subscribe through. {@link ensureMatterInChannelOrder} handles
            // both cases.
            await ensureMatterInChannelOrder();

            try {
                await subscriptionManager.subscribeToAllNodes(
                    sdkNodes,
                    handleNodeUpdate,
                );
            } catch (error) {
                console.warn(
                    "[matterTransformToESPCDFUser] subscribeToAllNodes threw:",
                    error,
                );
            }

            subscribedNodeIdList.length = 0;
            subscribedNodeIdList.push(...sdkNodes.map((node) => node.id));

            // iOS: post-login discovery can emit `ESPMatter:attributeReport`
            // before `subscribeToNodeUpdates` registers JS listeners (store
            // delays subscribe ~5s). Android already recovers via
            // `retrySubscribeForNodeId` on transport add — leave that path
            // unchanged. Re-subscribe matter nodes on iOS only (channel is
            // idempotent for native subscribe; adds callback only).
            if (Platform.OS === "ios") {
                const matterSdkNodes = sdkNodes.filter((node) => {
                    const meta = node.metadata as
                        | {
                              Matter?: unknown;
                              matter_node_id?: unknown;
                              matterNodeId?: unknown;
                          }
                        | undefined;
                    return Boolean(
                        meta?.Matter ??
                            meta?.matter_node_id ??
                            meta?.matterNodeId,
                    );
                });
                for (const matterNode of matterSdkNodes) {
                    try {
                        await subscriptionManager.subscribeToNode(
                            matterNode,
                            handleNodeUpdate,
                        );
                    } catch (error) {
                        console.warn(
                            `[matterTransformToESPCDFUser] iOS matter subscribe retry failed for ${matterNode.id}:`,
                            error,
                        );
                    }
                }
            }
        },

        async unsubscribeFromNodeUpdates(): Promise<void> {
            for (const nodeId of subscribedNodeIdList) {
                await ESPRMBase.subscriptionManager.unsubscribeFromNode(nodeId);
            }
            subscribedNodeIdList.length = 0;
        },
    };

    const baseUser = transformToESPCDFUserBase(esprmUser as any);
    baseUser.operations = {
        ...baseUser.operations,
        ...matterOperations,
    };
    baseUser.identifier = ESPRMMatterBaseAdaptorIdentifier;

    // Register a per-user retry helper that the Matter local discovery
    // layer can call after attaching a `matter_local` transport, to recover
    // from the post-login race where `subscribeToAllNodes` ran before any
    // matter channel was available. Idempotent on the matter channel side.
    registerSubscribeRetryForUser(baseUser, async (nodeId, options) => {
        if (!lastSubscribeUpdateHandler) {
            console.warn(
                `[matterTransformToESPCDFUser] retry subscribe skipped for node ${nodeId}: no handler registered yet`,
            );
            return;
        }
        let rawNode = lastSubscribeSdkNodes.find((n) => n.id === nodeId);
        // Fallback for nodes that weren't part of the cold-start
        // `subscribeToAllNodes` snapshot — typically a freshly-commissioned
        // matter device added to the CDF store mid-session. The caller
        // (matterLocalDiscovery) supplies the raw ESPRMNode lifted off the
        // CDF mirror so we can subscribe without re-fetching the user node
        // list. Append it so future retries / shadow-rewrite param lookups
        // can resolve the node by id.
        if (!rawNode && options?.rawNode) {
            rawNode = options.rawNode as ESPRMNode;
            lastSubscribeSdkNodes = [...lastSubscribeSdkNodes, rawNode];
            console.log(
                `[matterTransformToESPCDFUser] retry subscribe: enrolling new node ${nodeId} from rawNode fallback`,
            );
        }
        if (!rawNode) {
            console.warn(
                `[matterTransformToESPCDFUser] retry subscribe skipped for node ${nodeId}: no rawNode available (not in subscribe-all snapshot, no fallback supplied)`,
            );
            return;
        }
        // Same defense as the initial subscribe path — if the matter
        // channel got dropped or the order got clobbered between the
        // first attempt and now, re-register / reorder so this retry
        // does not hit `No available subscription channels`.
        await ensureMatterInChannelOrder();
        try {
            console.log(
                `[matterTransformToESPCDFUser] retry subscribe → subscribeToNode for ${nodeId}`,
            );
            await ESPRMBase.subscriptionManager.subscribeToNode(
                rawNode,
                lastSubscribeUpdateHandler,
            );
            if (!subscribedNodeIdList.includes(nodeId)) {
                subscribedNodeIdList.push(nodeId);
            }
        } catch (error) {
            console.warn(
                `[matterTransformToESPCDFUser] retry subscribe failed for node ${nodeId}:`,
                error,
            );
        }
    });

    // Register a per-user one-shot attribute-read helper. Mirrors the iOS
    // RainMaker pattern (`getCurrentLevelValues()` /
    // `getCurrentSaturationValue()` etc. in `DeviceViewController+UIWorker.swift`)
    // where each cell explicitly reads its current value before subscribing
    // — keeps the device-details panel aligned across platforms even when
    // CHIP-iOS's subscription pipeline doesn't deliver an initial frame.
    //
    // Each read result is dispatched through `lastSubscribeUpdateHandler` in
    // the same shape the matter channel emits subscription frames, so the
    // existing `rewriteMatterShadowPayload` + CDF `handleNodeParamsChanged`
    // pipeline routes the value to the UI without a special-case path.
    registerAttributeReadForUser(baseUser, async (nodeId) => {
        if (!lastSubscribeUpdateHandler) {
            console.warn(
                `[matterTransformToESPCDFUser] attribute read skipped for node ${nodeId}: no handler registered yet`,
            );
            return;
        }
        const sdkNode = lastSubscribeSdkNodes.find((n) => n.id === nodeId);
        if (!sdkNode) {
            console.warn(
                `[matterTransformToESPCDFUser] attribute read skipped for node ${nodeId}: not in subscribe-all snapshot`,
            );
            return;
        }
        const matterNodeId = (sdkNode as { matterNodeId?: string })
            .matterNodeId;
        if (!matterNodeId) return;

        const devices = (
            sdkNode as {
                nodeConfig?: {
                    devices?: {
                        name?: string;
                        params?: {
                            name?: string;
                            endpointId?: number;
                            clusterId?: number;
                            matterAttributeId?: number;
                        }[];
                    }[];
                };
            }
        ).nodeConfig?.devices;
        if (!devices || devices.length === 0) return;

        const adapter = ESPRMMatterBase.ESPMatterControlAdapter;
        if (!adapter) {
            console.warn(
                `[matterTransformToESPCDFUser] attribute read skipped for node ${nodeId}: ESPMatterControlAdapter not configured`,
            );
            return;
        }

        const reads: Promise<void>[] = [];
        for (const device of devices) {
            if (!device?.params) continue;
            for (const param of device.params) {
                const endpointId = param.endpointId;
                const clusterId = param.clusterId;
                if (endpointId === undefined || clusterId === undefined) {
                    continue;
                }
                // Skip clusters the app has no UI surface for. The matter
                // SDK transformer auto-builds CDF params for every cluster
                // exposed by `metadata.Matter.endpoints` — including
                // standard utility clusters (Descriptor 0x1d, Identify 0x3,
                // Groups 0x4, Binding 0x1e, …) that exist on every Matter
                // endpoint but have no resolver in `cluster.config.ts`.
                // Reading them just burns a Matter round-trip and produces
                // a `sdkParamFound=false` shadow update that CDF drops.
                const registryEntry = getClusterRegistryEntry(clusterId);
                if (!registryEntry) continue;
                // Prefer the param's own `matterAttributeId`. Fall back to
                // the cluster registry's `valueAttribute` for params built
                // with `writeAsCommand: true` / `matterCommandId` (e.g.
                // RvcRunMode `CurrentMode`, RvcCleanMode `CurrentMode`,
                // OperationalState `OperationalState`) where the matter
                // SDK's `buildClusterParams` strips `matterAttributeId` to
                // `undefined`. Same fallback shape used by
                // `rewriteMatterShadowPayload`.
                let attributeId = param.matterAttributeId;
                if (attributeId === undefined) {
                    attributeId = registryEntry.params.find(
                        (p) => p.name === param.name,
                    )?.valueAttribute;
                }
                if (attributeId === undefined) continue;

                reads.push(
                    (async () => {
                        try {
                            const result = await adapter.read(
                                matterNodeId,
                                endpointId,
                                clusterId,
                                attributeId as number,
                            );
                            if (!result.success) return;
                            const synthetic: ESPNodeUpdateData = {
                                nodeId,
                                source: "matter",
                                eventType: "rmaker.event.node_params_changed",
                                payload: {
                                    [`cluster_${clusterId}_attr_${attributeId}`]:
                                        result.value,
                                },
                                metadata: {
                                    endpointId,
                                    clusterId,
                                    attributeId,
                                    timestamp: Date.now(),
                                },
                            };
                            lastSubscribeUpdateHandler?.(synthetic);
                        } catch (error) {
                                    console.warn(
                                        `[matterTransformToESPCDFUser] attribute read failed for node ${nodeId} ep=${endpointId} clu=0x${clusterId.toString(16)} att=0x${(attributeId as number).toString(16)}:`,
                                        error,
                                    );
                        }
                    })(),
                );
            }
        }
        if (reads.length === 0) return;
        console.log(
            `[matterTransformToESPCDFUser] attribute read: dispatching ${reads.length} matter read(s) for node ${nodeId}`,
        );
        await Promise.allSettled(reads);
    });

    return baseUser;
}
