/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";
import {
  ESPCDF,
  ESPCDFCreateGroupRequest,
  ESPCDFGroup,
  ESPCDFMatterPrecommissionInfo,
  ESPCDFNode,
  ESPCDFPaginatedAPIResponse,
  ESPCDFSubscribeToNodeUpdatesRequestParams,
  ESPCDFUser,
  GroupStoreCallbacks,
} from "@store";
import {
  ESPRMNGBase,
  ESPRMNGUser,
  type ESPRMNGGroup,
  type ESPNodeUpdateData,
} from "@espressif/rmng-base-sdk";
import type { ESPRMNGMatterNode } from "@espressif/rmng-matter-sdk";
import {
  type ESPRMNGMatterDiscoveryParamsInterface,
  ESPRMNGMatterEventType,
  ESPRMNGMatterBase,
  getClusterRegistryEntry,
} from "@espressif/rmng-matter-sdk";
import { ESPMatterUtilityAdapter } from "@native-adaptors/implementations/ESPMatterUtilityAdapter";
import { ESPMatterControlAdapter } from "@native-adaptors/implementations/ESPMatterControlAdapter";
import { matterLocalDiscoveryAdapter } from "@native-adaptors/implementations/MatterDiscoverAdapter";
import { transformToESPCDFUserBase } from "@sdk-adaptors/ESPRMNGBase/transformers/transformToESPCDFUser";
import { transformToESPCDFNode } from "./transformToESPCDFNode";
import { transformToESPCDFGroup } from "./transformToESPCDFGroup";
import { emitShadowConnectivityEvents } from "@sdk-adaptors/ESPRMNGBase/utils/common";
import {
  logRmngDeviceParamsRaw,
  logRmngGroupsFabricsRaw,
  logRmngNodeConfigRaw,
} from "@sdk-adaptors/ESPRMNGBase/utils/rmngAdaptorDebugLog";
import { setRmngHybridSubscribeUpdateHandler } from "../rmngHybridSubscribeSession";
import { ensureRmngMatterSdkConfigured } from "../ensureMatterSDK";
import {
  cdfNodesNeedMatterSubscription,
  ensureRmngMatterSdkIfNeeded,
} from "../rmngMatterLazyInit";
import { ESPRMNGMatterBaseAdaptorIdentifier } from "../constants";
import {
  prepareRmngMatterGroupsContext,
  syncRmngMatterHomeWithNodes,
  transformRmngMatterSdkGroupsPageToCdf,
} from "../rmngMatterGroupSync";
import { getRmngGroupNodeWithMatterRecovery } from "../utils/getRmngGroupNodeWithMatterRecovery";
import { ensureRmngMatterInChannelOrder } from "./matterChannelOrder";
import { initializeRmngMatterSubscription } from "../utils/initializeRmngMatterSubscription";
import {
  cdfNodeToRmngSubscribeShape,
  isRmngMatterSubscribeNode,
  type RmngSubscribeNodeShape,
} from "../utils/rmngMatterSubscribeShape";
import { mapNodeUpdateDataToEvent } from "@shared/utils/subscriptionHelper";
import {
  registerSubscribeRetryForUser,
  flushPendingMatterSubscribeRetries,
  queuePendingMatterSubscribeRetry,
} from "@shared/utils/matterSubscribeRetry";
import { registerAttributeReadForUser } from "@shared/utils/matterAttributeRead";
import { isMatterNodeLocallyReachable } from "@shared/utils/matterLocalReachability";
import { rewriteMatterShadowPayload } from "@sdk-adaptors/ESPRMMatterBase/transformers/matterSubscriptionRouting";
import type { MatterParamDecodeContext } from "../utils/decodeRmngMatterParamForCdf";
import { handleMatterLocalParamUpdate } from "./matterSubscriptionRouting";
import {
  isRmngPureMatterCdfNode,
  isRmngMatterHybridCdfNode,
} from "../utils/rmngMatterNodeKind";
import { resolveRmngMatterShadowPayloadForCdf } from "../utils/rmngMatterShadowParams";
import { mergeRmngEndpointParamTrees } from "../utils/rmngMatterHybridBuildParams";
import { isRmngMatterEndpointParamFormat } from "../utils/rmngMatterEndpointFormat";
import { subscribeHybridNodeChannels } from "./rmngHybridSubscribeChannels";
import { resolveRmngNodeTransformOptions } from "./loadPureMatterBuildContext";
import {
  isPureMatterGroupNode,
  correctRmngOnlyNodeCapability,
  resolveGroupNodeCapabilityFromStore,
} from "../utils/rmngGroupNodeDetailsContext";
import { orderSdkGroupsForNodeLookup } from "@sdk-adaptors/ESPRMNGBase/utils/resolveSdkGroupForNodeId";
import {
  MATTER_LOCAL_DISCOVERY_EVENT,
  MATTER_LOCAL_DISCOVERY_LOST_EVENT,
  MDNS_DOMAIN_LOCAL,
  MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
} from "@shared/utils/constants";
import { installMatterDiscoveryGroupCallbacksWrapper } from "@shared/utils/matterDiscoveryGroupCallbacks";
import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";

interface MatterDiscoverySubscribeConfig {
  serviceType?: string;
  domain?: string;
}

function resolveMatterEventType(event: string): string {
  if (event === MATTER_LOCAL_DISCOVERY_EVENT) {
    return ESPRMNGMatterEventType.matterLocalDiscovery;
  }
  if (event === MATTER_LOCAL_DISCOVERY_LOST_EVENT) {
    return ESPRMNGMatterEventType.matterLocalDiscoveryLost;
  }
  return event;
}

function resolveMatterDiscoveryConfig(
  config?: MatterDiscoverySubscribeConfig,
): ESPRMNGMatterDiscoveryParamsInterface | undefined {
  if (!config) {
    return undefined;
  }
  return {
    serviceType: config.serviceType ?? MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
    domain: config.domain ?? MDNS_DOMAIN_LOCAL,
  };
}

function collectMatterRoutingNodesForUpdate(
  cdfNode: ESPCDFNode | undefined,
  subscribedNodes: ESPRMNGMatterNode[],
): ESPRMNGMatterNode[] {
  const nodes = [...subscribedNodes];
  const routingNode = (cdfNode?._raw as { _routingNode?: ESPRMNGMatterNode } | undefined)
    ?._routingNode;
  if (!routingNode) return nodes;

  const routingId =
    routingNode.nodeId ?? (routingNode as { id?: string }).id;
  if (
    !nodes.some(
      (n) => (n.nodeId ?? (n as { id?: string }).id) === routingId,
    )
  ) {
    nodes.push(routingNode);
  }
  return nodes;
}

/**
 * Matter-aware user transform: delegates to {@link transformToESPCDFUserBase},
 * then overrides Matter-only operations (discovery, hybrid subscribe, commissioning).
 */
export function transformToESPCDFUser(
  esprmngUser: ESPRMNGUser | null,
): ESPCDFUser {
  const baseUser = transformToESPCDFUserBase(esprmngUser);
  const esprmngUserRaw = esprmngUser as ESPRMNGUser;
  const baseOps = baseUser.operations;
  const mqttConnectionPromise = esprmngUserRaw.connectMQTT().catch((error) => {
    console.error("[transformToESPCDFUser] Failed to connect MQTT:", error);
  });

  let lastSubscribeSdkNodes: RmngSubscribeNodeShape[] = [];
  let lastSubscribeRoutingNodes: ESPRMNGMatterNode[] = [];
  const subscribedNodeIdList: string[] = [];
  let lastSubscribeUpdateHandler:
    | ((update: ESPNodeUpdateData) => void)
    | null = null;

  const matterOperations = {
    async getGroups(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>> {
      const groups = await prepareRmngMatterGroupsContext(
        esprmngUserRaw,
        "getGroups",
      );
      const response = transformRmngMatterSdkGroupsPageToCdf(
        esprmngUserRaw,
        groups,
      );
      logRmngGroupsFabricsRaw("getGroups.cdf", { cdfGroups: response.data });
      return response;
    },

    async createGroup(data: ESPCDFCreateGroupRequest): Promise<ESPCDFGroup> {
      const group = await esprmngUserRaw.createGroup(data.name);
      return transformToESPCDFGroup(
        group,
        esprmngUserRaw,
        ESPRMNGMatterBaseAdaptorIdentifier,
      );
    },

    async createHome(
      params: { name: string },
      callbacks: GroupStoreCallbacks,
    ): Promise<ESPCDFGroup> {
      const newHome = await esprmngUserRaw.createGroup(params.name);
      const cdfHome = transformToESPCDFGroup(
        newHome,
        esprmngUserRaw,
        ESPRMNGMatterBaseAdaptorIdentifier,
      );
      callbacks.addGroup(cdfHome);
      return cdfHome;
    },

    async getNodeDetails(nodeId: string): Promise<ESPCDFNode> {
      const groups = await prepareRmngMatterGroupsContext(
        esprmngUserRaw,
        "getNodeDetails",
      );

      const toCdfNode = async (
        rmngNode: ESPRMNGNode,
        group: ESPRMNGGroup,
      ): Promise<ESPCDFNode> => {
        logRmngNodeConfigRaw("user.getNodeDetails", nodeId, rmngNode.config, {
          groupId: rmngNode.groupId ?? group.groupId,
          params: (rmngNode as { params?: unknown }).params,
        });
        const groupNodeCapability = correctRmngOnlyNodeCapability(
          resolveGroupNodeCapabilityFromStore(
            nodeId,
            rmngNode.groupId ?? group.groupId,
          ),
          group.nodeDetails?.[nodeId],
        );
        const options = await resolveRmngNodeTransformOptions(rmngNode, {
          groupId: rmngNode.groupId ?? group.groupId,
          groupNodeCapability,
          isPureMatterFromGroup: groupNodeCapability
            ? isPureMatterGroupNode(groupNodeCapability, nodeId)
            : undefined,
          isMatterLocallyReachable: isMatterNodeLocallyReachable(nodeId),
        });
        return transformToESPCDFNode(rmngNode, options);
      };

      let lastError: unknown;
      for (const group of orderSdkGroupsForNodeLookup(groups, nodeId)) {
        try {
          const rmngNode = await getRmngGroupNodeWithMatterRecovery(
            group,
            nodeId,
            true,
          );
          return await toCdfNode(rmngNode, group);
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError instanceof Error) {
        throw lastError;
      }
      throw new Error(`Node ${nodeId} not found in any group`);
    },

    async syncHomeWithNodes(
      user: ESPCDFUser,
      callbacks: GroupStoreCallbacks,
    ) {
      return syncRmngMatterHomeWithNodes(
        user,
        callbacks,
        esprmngUserRaw,
        mqttConnectionPromise,
      );
    },

    async subscribeToEvent(
      event: string,
      callback: (event: unknown) => void,
      config?: MatterDiscoverySubscribeConfig,
    ): Promise<void> {
      if (
        event === MATTER_LOCAL_DISCOVERY_EVENT ||
        event === MATTER_LOCAL_DISCOVERY_LOST_EVENT
      ) {
        await ensureRmngMatterSdkConfigured();
        const matterEvent = resolveMatterEventType(event);
        const discoveryConfig = resolveMatterDiscoveryConfig(config);
        const sdkBase = ESPRMNGMatterBase as unknown as {
          ESPRMNGMatterLocalDiscoveryAdapter?: unknown;
        };
        if (
          !sdkBase.ESPRMNGMatterLocalDiscoveryAdapter &&
          matterLocalDiscoveryAdapter
        ) {
          console.warn(
            "[MatterDiscoveryVerify] SDK localDiscoveryAdapter was unset; re-asserting from app adapter",
          );
          sdkBase.ESPRMNGMatterLocalDiscoveryAdapter =
            matterLocalDiscoveryAdapter;
        }
        console.log(
          "[MatterDiscoveryVerify] subscribeToEvent matter:",
          event,
          "sdkDiscoveryAdapterSet=",
          Boolean(sdkBase.ESPRMNGMatterLocalDiscoveryAdapter),
        );
        esprmngUserRaw.subscribe(
          matterEvent,
          callback as (arg: unknown) => void,
          discoveryConfig,
        );
        return;
      }
      return baseOps.subscribeToEvent(event, callback);
    },

    async unsubscribeFromEvent(
      event: string,
      callback: (event: unknown) => void,
    ): Promise<void> {
      if (
        event === MATTER_LOCAL_DISCOVERY_EVENT ||
        event === MATTER_LOCAL_DISCOVERY_LOST_EVENT
      ) {
        await ensureRmngMatterSdkConfigured();
        esprmngUserRaw.unsubscribe(
          resolveMatterEventType(event),
          callback as (arg: unknown) => void,
        );
        return;
      }
      return baseOps.unsubscribeFromEvent(event, callback);
    },

    async isUserNocAvailableForFabric(fabricId: string): Promise<boolean> {
      return ESPMatterUtilityAdapter.isUserNocAvailableForFabric(fabricId);
    },

    async storePrecommissionInfo(
      info: ESPCDFMatterPrecommissionInfo,
    ): Promise<void> {
      return ESPMatterUtilityAdapter.storePrecommissionInfo(info);
    },

    async subscribeToNodeUpdates(
      params: ESPCDFSubscribeToNodeUpdatesRequestParams,
    ): Promise<void> {
      await ensureRmngMatterSdkIfNeeded({ cdfNodes: params.nodeList });
      if (cdfNodesNeedMatterSubscription(params.nodeList)) {
        try {
          await initializeRmngMatterSubscription();
        } catch (error) {
          console.warn(
            "[transformToESPCDFUser] initializeRmngMatterSubscription failed:",
            error,
          );
        }
      }

      const subscriptionManager = ESPRMNGBase.subscriptionManager;
      const sdkNodes = params.nodeList.map((node) =>
        cdfNodeToRmngSubscribeShape(node),
      );
      const cdfStore = ESPCDF.instance;

      const handleNodeUpdate = (update: ESPNodeUpdateData) => {
        const nodeId = update.nodeId;
        const cdfNode = cdfStore?.nodeStore?.getNodeById?.(nodeId);
        const transport = update.source === "matter" ? "matter" : "mqtt";

        logRmngDeviceParamsRaw(
          "subscribeToNodeUpdates.handleNodeUpdate",
          nodeId,
          transport,
          update.payload,
          {
            source: update.source,
            metadata: update.metadata,
          },
        );

        console.log(
          "[rmngTransformToESPCDFUser] handleNodeUpdate A:",
          "nodeId=",
          nodeId,
          "source=",
          update.source,
          "metadata=",
          update.metadata,
          "payloadKeys=",
          update.payload && typeof update.payload === "object"
            ? Object.keys(update.payload as object)
            : update.payload,
        );

        if (
          update.source === "matter" &&
          cdfNode &&
          (isRmngPureMatterCdfNode(cdfNode) || isRmngMatterHybridCdfNode(cdfNode))
        ) {
          const routingNodes = collectMatterRoutingNodesForUpdate(
            cdfNode,
            lastSubscribeRoutingNodes,
          );
          const shadow = rewriteMatterShadowPayload(update, routingNodes);
          const funnelPayload =
            (shadow as Record<string, Record<string, unknown>> | undefined) ??
            (update.payload as Record<string, Record<string, unknown>>);
          const paramDecodeContext: MatterParamDecodeContext = shadow
            ? "rewrite_shadow"
            : "matter_subscription";
          void handleMatterLocalParamUpdate(
            nodeId,
            funnelPayload,
            cdfStore ?? undefined,
            update.metadata as
              | {
                  endpointId?: number;
                  clusterId?: number;
                  attributeId?: number;
                }
              | undefined,
            { paramDecodeContext },
          );
          console.log(
            "[rmngTransformToESPCDFUser] handleNodeUpdate B: matter local funnel",
            shadow ? "rewrite_shadow" : "matter_subscription",
          );
          return;
        }

        if (cdfNode && isRmngMatterHybridCdfNode(cdfNode) && update.source !== "matter") {
          const shadowDoc = (update.metadata as { shadow?: unknown } | undefined)
            ?.shadow;
          if (shadowDoc) {
            emitShadowConnectivityEvents(nodeId, shadowDoc, (ev) =>
              params.onNodeUpdate?.(ev),
            );
          }
          const mappedPayload = resolveRmngMatterShadowPayloadForCdf(
            cdfNode,
            update.payload as Record<string, unknown>,
          );
          if (
            mappedPayload === null ||
            isRmngMatterEndpointParamFormat(mappedPayload)
          ) {
            return;
          }
          const rawSdk = cdfNode._raw as ESPRMNGNode | undefined;
          if (
            rawSdk &&
            isRmngMatterEndpointParamFormat(
              update.payload as Record<string, unknown>,
            )
          ) {
            rawSdk.params = mergeRmngEndpointParamTrees(
              (rawSdk.params as Record<string, unknown>) ?? {},
              update.payload as Record<string, unknown>,
            );
          }
          console.log(
            "[rmngTransformToESPCDFUser] handleNodeUpdate B: hybrid mqtt shadow mapped",
            mappedPayload,
          );
          const nodeUpdateEvent = mapNodeUpdateDataToEvent({
            ...update,
            payload: mappedPayload,
          });
          params.onNodeUpdate?.(nodeUpdateEvent);
          return;
        }

        const shadow = rewriteMatterShadowPayload(
          update,
          lastSubscribeRoutingNodes,
        );
        console.log(
          "[rmngTransformToESPCDFUser] handleNodeUpdate B: shadow=",
          shadow ?? "(undefined — no param match)",
        );
        const routedUpdate: ESPNodeUpdateData = shadow
          ? { ...update, payload: shadow }
          : update;
        console.log(
          "[rmngTransformToESPCDFUser] handleNodeUpdate C: routedPayload=",
          routedUpdate.payload,
        );
        const nodeUpdateEvent = mapNodeUpdateDataToEvent(routedUpdate);
        params.onNodeUpdate?.(nodeUpdateEvent);
      };

      lastSubscribeUpdateHandler = handleNodeUpdate;
      setRmngHybridSubscribeUpdateHandler(handleNodeUpdate);
      lastSubscribeSdkNodes = sdkNodes;
      lastSubscribeRoutingNodes = params.nodeList
        .map(
          (node) =>
            (node._raw as { _routingNode?: ESPRMNGMatterNode } | undefined)
              ?._routingNode,
        )
        .filter((n): n is ESPRMNGMatterNode => !!n);

      await ensureRmngMatterInChannelOrder();

      const hybridCdfNodes = params.nodeList.filter(isRmngMatterHybridCdfNode);
      const hybridNodeIds = new Set(hybridCdfNodes.map((n) => n.id));
      const nonHybridSdkNodes = sdkNodes.filter((n) => !hybridNodeIds.has(n.id));

      try {
        await subscriptionManager.subscribeToAllNodes(
          nonHybridSdkNodes,
          handleNodeUpdate,
        );
      } catch (error) {
        console.warn(
          "[transformToESPCDFUser] subscribeToAllNodes failed:",
          error,
        );
      }

      for (const hybridCdfNode of hybridCdfNodes) {
        try {
          await subscribeHybridNodeChannels(
            hybridCdfNode.id,
            hybridCdfNode,
            handleNodeUpdate,
          );
        } catch (error) {
          console.warn(
            `[transformToESPCDFUser] hybrid dual-channel subscribe failed for ${hybridCdfNode.id}:`,
            error,
          );
        }
      }

      subscribedNodeIdList.length = 0;
      subscribedNodeIdList.push(...sdkNodes.map((node) => node.id));

      if (Platform.OS === "ios") {
        const matterNodes = sdkNodes.filter(
          (n) => isRmngMatterSubscribeNode(n) && !hybridNodeIds.has(n.id),
        );
        for (const matterNode of matterNodes) {
          try {
            await subscriptionManager.subscribeToNode(
              matterNode,
              handleNodeUpdate,
            );
          } catch (error) {
            console.warn(
              `[transformToESPCDFUser] iOS matter subscribe retry failed for ${matterNode.id}:`,
              error,
            );
          }
        }
      }

      await flushPendingMatterSubscribeRetries(baseUser);
    },

    async unsubscribeFromNodeUpdates(): Promise<void> {
      await baseOps.unsubscribeFromNodeUpdates!();
      lastSubscribeUpdateHandler = null;
      setRmngHybridSubscribeUpdateHandler(null);
      lastSubscribeSdkNodes = [];
      lastSubscribeRoutingNodes = [];
      subscribedNodeIdList.length = 0;
    },
  };

  baseUser.operations = {
    ...baseOps,
    ...matterOperations,
  };

  installMatterDiscoveryGroupCallbacksWrapper(baseUser);

  registerAttributeReadForUser(baseUser, async (nodeId) => {
    if (!lastSubscribeUpdateHandler) {
      console.warn(
        `[transformToESPCDFUser] attribute read skipped for ${nodeId}: no handler`,
      );
      return;
    }

    type MatterParamLike = {
      name?: string;
      id?: string;
      endpointId?: number;
      clusterId?: number;
      matterAttributeId?: number;
    };

    const cdfNode = ESPCDF.instance?.nodeStore?.getNodeById?.(nodeId);
    if (!isMatterNodeLocallyReachable(nodeId)) {
      console.warn(
        `[transformToESPCDFUser] attribute read skipped for ${nodeId}: matter_local unavailable`,
      );
      return;
    }

    const rawNode = cdfNode?._raw as
      | {
          _routingNode?: ESPRMNGMatterNode;
          _sdkDevices?: { id?: string; params?: MatterParamLike[] }[];
          devices?: { id?: string; params?: MatterParamLike[] }[];
          matterNodeId?: string;
        }
      | undefined;
    const routingNode =
      rawNode?._routingNode ??
      lastSubscribeRoutingNodes.find((n) => n.nodeId === nodeId);

    const sdkDevices = rawNode?._sdkDevices ?? rawNode?.devices;
    const devices: { params?: MatterParamLike[] }[] | undefined =
      sdkDevices?.length
        ? (sdkDevices as { params?: MatterParamLike[] }[])
        : routingNode?.devices?.map((device) => ({
            params: device.params as MatterParamLike[] | undefined,
          }));

    if (!devices?.length) {
      console.warn(
        `[transformToESPCDFUser] attribute read skipped for ${nodeId}: no Matter devices`,
      );
      return;
    }

    const matterNodeId =
      rawNode?.matterNodeId ??
      (routingNode as { matterNodeId?: string } | undefined)?.matterNodeId ??
      (cdfNode as { matterNodeId?: string } | undefined)?.matterNodeId ??
      (cdfNode?.metadata as { matter_node_id?: string } | undefined)?.matter_node_id;
    if (!matterNodeId) return;

    const adapter = ESPMatterControlAdapter;
    if (!adapter) return;

    for (const device of devices) {
      if (!device?.params) continue;
      for (const param of device.params) {
        const endpointId = param.endpointId;
        const clusterId = param.clusterId;
        if (endpointId === undefined || clusterId === undefined) continue;

        const registryEntry = getClusterRegistryEntry(clusterId);
        if (!registryEntry) continue;

        let attributeId = param.matterAttributeId;
        if (attributeId === undefined) {
          const paramKey = param.id ?? param.name;
          attributeId = registryEntry.params.find(
            (p) => p.name === paramKey,
          )?.valueAttribute;
        }
        if (attributeId === undefined) continue;

        try {
          const result = await adapter.read(
            matterNodeId,
            endpointId,
            clusterId,
            attributeId,
          );
          if (!result.success || result.value === undefined) continue;
          lastSubscribeUpdateHandler({
            nodeId,
            source: "matter",
            eventType: "rmaker.event.node_params_changed",
            payload: {
              [`cluster_${clusterId}_attr_${attributeId}`]: result.value,
            },
            metadata: {
              endpointId,
              clusterId,
              attributeId,
              timestamp: Date.now(),
            },
          });
        } catch (error) {
          console.warn(
            `[transformToESPCDFUser] attribute read failed ${nodeId}:`,
            error,
          );
        }
      }
    }
  });

  baseUser.identifier = ESPRMNGMatterBaseAdaptorIdentifier;

  registerSubscribeRetryForUser(baseUser, async (nodeId, options) => {
    if (!lastSubscribeUpdateHandler) {
      queuePendingMatterSubscribeRetry(baseUser, nodeId, options);
      console.warn(
        `[transformToESPCDFUser] retry subscribe queued for ${nodeId}: no handler`,
      );
      return;
    }

    let sdkNode = lastSubscribeSdkNodes.find((n) => n.id === nodeId);
    const cdfNode = ESPCDF.instance?.nodeStore?.getNodeById?.(nodeId);
    if (cdfNode && isRmngMatterHybridCdfNode(cdfNode) && lastSubscribeUpdateHandler) {
      await ensureRmngMatterInChannelOrder();
      try {
        await subscribeHybridNodeChannels(
          nodeId,
          cdfNode,
          lastSubscribeUpdateHandler,
        );
        if (!subscribedNodeIdList.includes(nodeId)) {
          subscribedNodeIdList.push(nodeId);
        }
      } catch (error) {
        console.warn(
          `[transformToESPCDFUser] hybrid retry subscribe failed for ${nodeId}:`,
          error,
        );
      }
      return;
    }
    if (cdfNode) {
      sdkNode = cdfNodeToRmngSubscribeShape(cdfNode);
      const existingIdx = lastSubscribeSdkNodes.findIndex((n) => n.id === nodeId);
      if (existingIdx >= 0) {
        const next = [...lastSubscribeSdkNodes];
        next[existingIdx] = sdkNode;
        lastSubscribeSdkNodes = next;
      } else {
        lastSubscribeSdkNodes = [...lastSubscribeSdkNodes, sdkNode];
      }
    } else if (!sdkNode && options?.rawNode) {
      const raw = options.rawNode as {
        nodeId?: string;
        id?: string;
        matterNodeId?: string;
        type?: string;
        metadata?: Record<string, unknown>;
      };
      const id = raw.nodeId ?? raw.id ?? nodeId;
      const matterNodeId =
        (raw.matterNodeId as string | undefined) ??
        (raw.metadata?.matterNodeId as string | undefined) ??
        (raw.metadata?.matter_node_id as string | undefined) ??
        id;
      sdkNode = {
        id,
        type: raw.type ?? "pure_matter",
        metadata: {
          matter_node_id: matterNodeId,
          matterNodeId,
        },
      };
      lastSubscribeSdkNodes = [...lastSubscribeSdkNodes, sdkNode];
    }
    if (!sdkNode) {
      console.warn(
        `[transformToESPCDFUser] retry subscribe skipped for ${nodeId}: no sdk node`,
      );
      return;
    }

    await ensureRmngMatterInChannelOrder();
    try {
      await ESPRMNGBase.subscriptionManager
        .unsubscribeFromNode(nodeId)
        .catch(() => {});
      await ESPRMNGBase.subscriptionManager.subscribeToNode(
        sdkNode,
        lastSubscribeUpdateHandler,
      );
      if (!subscribedNodeIdList.includes(nodeId)) {
        subscribedNodeIdList.push(nodeId);
      }
    } catch (error) {
      console.warn(
        `[transformToESPCDFUser] retry subscribe failed for ${nodeId}:`,
        error,
      );
    }
  });

  return baseUser;
}
