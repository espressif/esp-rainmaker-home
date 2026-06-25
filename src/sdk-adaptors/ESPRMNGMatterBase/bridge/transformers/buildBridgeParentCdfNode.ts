/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDFNode,
    ESPCDFNodeConfig,
    ESPCDFNodeInfoInterface,
    ESPCDFAPIResponse,
    ESPCDF,
    ESPCDFDevice,
    EVENT_NODE_CONNECTED,
    EVENT_NODE_DISCONNECTED,
    type ESPCDFNodeOperation,
} from "@store";
import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { MATTER_LOCAL_TRANSPORT_KEY } from "@shared/utils/constants";
import { normalizeRmngSdkResponseToCdf, mapShadowDocumentToNodeUpdateEvents, emitShadowConnectivityEvents } from "@sdk-adaptors/ESPRMNGBase/utils/common";
import { refreshRmngNodeIfShadowNcfgVersionChanged } from "@sdk-adaptors/ESPRMNGBase/utils/rmngNcfgVersionShadowRefresh";
import { runNcfgShadowHandlerCoalesced } from "@sdk-adaptors/ESPRMNGBase/utils/rmngNcfgShadowCoalesce";
import { setRmngSdkNodeParamsListener } from "../../utils/rmngSdkNodeParamsListener";
import { ensureRmngSdkNodeMatterSubscribeShape } from "../../utils/rmngMatterSubscribeShape";
import { attachHybridSdkMqttSubscription } from "../../transformers/rmngHybridSubscribeChannels";
import type { TransformRmngNodeOptions } from "../../transformers/buildRmngMatterCdfNode";
import {
    deriveMatterNodeIdFromThingName,
    resolveOperationalMatterNodeId,
} from "@shared/utils/matterLocalStorage";
import { trackBridgeOnlineEdgeFromShadow } from "../rmngMatterBridgeReconnect";
import { removeBridgedChildrenFromStore } from "../rmngMatterBridgeNcfg";
import { BRIDGE_PARENT_DEVICE_TYPE } from "../rmngMatterBridgeKind";

const MQTT_TRANSPORT_KEY = "mqtt";

const BRIDGE_LOG = "[rmngBridge]";

/**
 * Matter bridge parent — LAN discovery target; controllable bridged devices are separate nodes.
 */
export function buildBridgeParentCdfNode(
    node: ESPRMNGNode,
    options?: TransformRmngNodeOptions,
): ESPCDFNode {
    const nodeId = node.nodeId;
    const groupId = options?.groupId ?? node.groupId ?? "";
    const matterNodeId =
        options?.matterNodeIdOverride ??
        (resolveOperationalMatterNodeId(nodeId, {
            fromGroupApi: options?.groupNodeCapability?.matterNodeId ?? null,
        }) ||
            deriveMatterNodeIdFromThingName(nodeId));

    const config = node.config as unknown as Record<string, unknown> | undefined;
    const inner = (config?.config ?? config) as Record<string, unknown> | undefined;
    const info =
        (inner?.info as ESPCDFNodeInfoInterface | undefined) ??
        (config?.info as ESPCDFNodeInfoInterface | undefined) ??
        ({} as ESPCDFNodeInfoInterface);

    const operations: ESPCDFNodeOperation = {
        setMultipleParams: async (_params: Record<string, unknown>) => {
            const res = await node.setParams(_params);
            return normalizeRmngSdkResponseToCdf(res, "Parameters updated successfully");
        },
        delete: async (): Promise<ESPCDFAPIResponse> => {
            const res = await node.delete();
            const cdfResponse = normalizeRmngSdkResponseToCdf(
                res,
                "Node deleted successfully",
            );
            removeBridgedChildrenFromStore(nodeId);
            return cdfResponse;
        },
        setTimeZone: async () => {
            throw new Error("Bridge parent setTimeZone not implemented");
        },
        updateMetadata: async () => {
            throw new Error("RMNGBase SDK does not support node updateMetadata");
        },
        checkOTAUpdate: async () => {
            throw new Error("RMNGBase SDK does not support node checkOTAUpdate");
        },
        pushOTAUpdate: async () => {
            throw new Error("RMNGBase SDK does not support node pushOTAUpdate");
        },
        getOTAUpdateStatus: async () => {
            throw new Error("RMNGBase SDK does not support node getOTAUpdateStatus");
        },
    };

    const displayName =
        (info?.name as string | undefined)?.trim() || "Matter Bridge";
    const bridgeDevice = new ESPCDFDevice({
        name: displayName,
        displayName,
        type: BRIDGE_PARENT_DEVICE_TYPE,
        params: [],
        operations: { getParams: async () => [] },
        _raw: { bridgeParentDevice: true },
    });

    const cdfNode = new ESPCDFNode({
        identifier: ESPRMNGBaseAdaptorIdentifier,
        id: nodeId,
        type: "bridge_parent",
        nodeConfig: new ESPCDFNodeConfig({
            configVersion: (config?.config_version as string | undefined) ?? "",
            info,
        }),
        devices: [bridgeDevice],
        services: [],
        connectivityStatus: node.connectivityStatus,
        metadata: {
            groupId,
            matter_node_id: matterNodeId,
            matterNodeId,
            isBridgeParent: true,
            isRmngMatterHybrid: false,
        },
        operations,
        isPrimaryUser: true,
        transportOrder: matterNodeId
            ? [MATTER_LOCAL_TRANSPORT_KEY, MQTT_TRANSPORT_KEY]
            : [MQTT_TRANSPORT_KEY],
        availableTransports: matterNodeId
            ? {
                  [MATTER_LOCAL_TRANSPORT_KEY]: {
                      type: MATTER_LOCAL_TRANSPORT_KEY,
                      metadata: { matterNodeId },
                  },
                  [MQTT_TRANSPORT_KEY]: { type: MQTT_TRANSPORT_KEY, metadata: {} },
              }
            : {
                  [MQTT_TRANSPORT_KEY]: { type: MQTT_TRANSPORT_KEY, metadata: {} },
              },
        _raw: node,
    });

    (cdfNode as { isMatter?: boolean }).isMatter = true;
    (cdfNode as { matterNodeId?: string }).matterNodeId = matterNodeId;
    (cdfNode as { nodeType?: string }).nodeType = "bridge_parent";

    console.log(`${BRIDGE_LOG} buildBridgeParentCdfNode`, { nodeId, matterNodeId });

    if (matterNodeId) {
        ensureRmngSdkNodeMatterSubscribeShape(node, nodeId, matterNodeId, "rmng_matter");
        node.setSubscriptionChannelOrder?.(["mqtt"]);
    }

    void attachHybridSdkMqttSubscription(node, matterNodeId).catch((error: unknown) => {
        console.warn(
            `${BRIDGE_LOG} SDK MQTT re-attach failed`,
            nodeId,
            error,
        );
    });

    setRmngSdkNodeParamsListener(node, (event: unknown) => {
        const isShadowDoc =
            event &&
            typeof event === "object" &&
            (event as { state?: { reported?: unknown } }).state?.reported !== undefined;
        if (!isShadowDoc) return;

        trackBridgeOnlineEdgeFromShadow(nodeId, event);

        const root = ESPCDF.instance;
        const listen = root?.subscriptionStore?.nodeUpdates?.listen;
        if (!listen) return;

        void (async () => {
            emitShadowConnectivityEvents(nodeId, event, listen);

            const isPrimary = await runNcfgShadowHandlerCoalesced(nodeId, async () => {
                try {
                    await refreshRmngNodeIfShadowNcfgVersionChanged(nodeId, event);
                } catch (err) {
                    console.warn(
                        `[ncfg_ver][app] refreshRmngNodeIfShadowNcfgVersionChanged failed nodeId=${nodeId}`,
                        err,
                    );
                }
            });
            if (!isPrimary) return;

            const events = mapShadowDocumentToNodeUpdateEvents(nodeId, event);
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
    });

    return cdfNode;
}
