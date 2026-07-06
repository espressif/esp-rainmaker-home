/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDF,
    ESPCDFNode,
    ESPCDFNodeConfig,
    ESPCDFNodeInfoInterface,
    ESPCDFNodeOperation,
    ESPCDFAPIResponse,
    ESPCDFTransportConfig,
    type ESPCDFPropertyChangeCallback,
    type ESPCDFPropertyChangeEvent,
} from "@store";
import { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import { ESPRMNGMatterNode } from "@espressif/rmng-matter-sdk";
import type { ESPRMNGMatterMetadataInterface } from "@espressif/rmng-matter-sdk";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { transformToESPCDFService } from "@sdk-adaptors/ESPRMNGBase/transformers/transformToESPCDFService";
import { syncAvailableTransportsToRmngSdkNode } from "@sdk-adaptors/ESPRMNGBase/utils/rmngSyncSdkNodeTransports";
import { normalizeRmngSdkResponseToCdf } from "@sdk-adaptors/ESPRMNGBase/utils/common";
import { syncCdfDeviceDisplayName } from "@sdk-adaptors/shared/utils/common";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { ESPRM_NAME_PARAM_TYPE } from "@shared/utils/constants";
import { MATTER_LOCAL_TRANSPORT_KEY } from "@shared/utils/constants";
import { compressedEndpointsToRmngEndpoints } from "../utils/rmngMatterEndpointFormat";
import { matterDataToEspMetadata } from "../utils/matterDataToMetadata";
import { readInnerConfig } from "../utils/rmngMatterNodeKind";
import { buildMatterRoutingNode } from "../utils/rmngMatterTopologyHelpers";
import { buildRmngHybridMatterDevices } from "./buildRmngHybridMatterDevices";
import {
    buildBridgedChildMatterDevices,
    filterMergedDataToOwnedEndpoints,
} from "../bridge/transformers/buildBridgedChildMatterDevices";
import type { TransformRmngNodeOptions } from "./buildRmngMatterCdfNode";
import { ensureRmngSdkNodeMatterSubscribeShape } from "../utils/rmngMatterSubscribeShape";
import { retrySubscribeForNodeId } from "@shared/utils/matterSubscribeRetry";
import { attachHybridSdkMqttSubscription } from "./rmngHybridSubscribeChannels";
import { bindHybridMatterMqttParamsBridge } from "../utils/bindHybridMatterMqttParamsBridge";

const MQTT_TRANSPORT_KEY = "mqtt";

const createRoutingPropertyChangeSyncCallback = (
    routingNode: ESPRMNGMatterNode | undefined,
): ESPCDFPropertyChangeCallback => {
    return (event: ESPCDFPropertyChangeEvent) => {
        if (event.type !== "deviceParamChanged" || !routingNode) return;
        const device = routingNode.devices?.find((d) => d.id === event.deviceName);
        const param = device?.params?.find((p) => p.id === event.paramName);
        if (param) param.value = event.value;
    };
};

const createRmngPropertyChangeSyncCallback = (
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
            case "availableTransportsChanged":
                syncAvailableTransportsToRmngSdkNode(
                    rawNode,
                    event.availableTransports as Record<string, ESPCDFTransportConfig>,
                );
                break;
            default:
                break;
        }
    };
};

/**
 * Builds a hybrid RMNG+Matter CDF node from merged endpoint config+params.
 */
export function buildRmngHybridMatterCdfNode(
    node: ESPRMNGNode,
    options?: TransformRmngNodeOptions,
): ESPCDFNode {
    const nodeId = node.nodeId;
    const groupId = options?.groupId ?? node.groupId ?? "";
    const mergedData = options?.rmngMatterMergedData ?? {
        data_model: "matter",
        endpoints: {},
    };

    const matterNodeId = options?.matterNodeIdOverride;
    if (matterNodeId) {
        ensureRmngSdkNodeMatterSubscribeShape(node, nodeId, matterNodeId, "rmng_matter");
        if (options?.subscriptionChannelOrder?.length) {
            node.setSubscriptionChannelOrder?.(options.subscriptionChannelOrder);
        }
    }

    const preferredName =
        (options?.localMatterMetadata?.deviceName as string | undefined) ??
        (options?.matterMetadata as { deviceName?: string } | undefined)?.deviceName ??
        (mergedData.info as { name?: string } | undefined)?.name;

    const ownedEndpointIds = options?.isBridgedRmngMatterChild
        ? Object.keys(
              (mergedData.endpoints as Record<string, unknown> | undefined) ?? {},
          )
        : undefined;
    const scopedMergedData =
        options?.isBridgedRmngMatterChild && ownedEndpointIds?.length
            ? filterMergedDataToOwnedEndpoints(mergedData, ownedEndpointIds)
            : mergedData;

    const writeContext = {
        node,
        nodeId,
        matterNodeId,
    };
    const devices = options?.isBridgedRmngMatterChild
        ? buildBridgedChildMatterDevices(
              scopedMergedData,
              preferredName,
              writeContext,
              ownedEndpointIds,
          )
        : buildRmngHybridMatterDevices(scopedMergedData, preferredName, writeContext);

    const rmngEndpoints = compressedEndpointsToRmngEndpoints(
        scopedMergedData.endpoints as Record<string, unknown> | undefined,
    );
    const routingMeta =
        matterDataToEspMetadata(
            { data_model: "matter", endpoints: rmngEndpoints },
            { deviceName: preferredName },
        ) ?? options?.matterMetadata;

    const routingNode =
        matterNodeId && routingMeta
            ? buildMatterRoutingNode(
                  nodeId,
                  matterNodeId,
                  routingMeta as ESPRMNGMatterMetadataInterface,
              )
            : undefined;

    const inner = readInnerConfig(node);
    const config = node.config as unknown as Record<string, unknown> | undefined;
    const nodeInfo =
        (config?.info as ESPCDFNodeInfoInterface | undefined) ??
        (inner?.info as ESPCDFNodeInfoInterface | undefined) ??
        ({} as ESPCDFNodeInfoInterface);

    const operations: ESPCDFNodeOperation = {
        setMultipleParams: async (_params: Record<string, unknown>) => {
            const res = await node.setParams(_params);
            return normalizeRmngSdkResponseToCdf(res, "Parameters updated successfully");
        },
        delete: async (): Promise<ESPCDFAPIResponse> => {
            const res = await node.delete();
            return normalizeRmngSdkResponseToCdf(res, "Node deleted successfully");
        },
        setTimeZone: async () => {
            throw new Error("RMNG hybrid Matter node setTimeZone not implemented");
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

    // Cloud transports only at build time — `matter_local` is registered by
    // matter local discovery (same pattern as RainMaker `local` transport).
    const availableTransports: Partial<Record<string, ESPCDFTransportConfig>> = {
        [MQTT_TRANSPORT_KEY]: { type: MQTT_TRANSPORT_KEY, metadata: {} },
    };

    const cdfNode = new ESPCDFNode({
        identifier: ESPRMNGBaseAdaptorIdentifier,
        id: nodeId,
        type: "rmng_matter",
        nodeConfig: new ESPCDFNodeConfig({
            configVersion: (config?.config_version as string | undefined) ?? "",
            info: nodeInfo,
        }),
        devices,
        services: safeTransform(
            node.services,
            "hybridMatterNode.services",
            (service) => transformToESPCDFService(service as Parameters<typeof transformToESPCDFService>[0]),
            () => {},
            { skipElement: (service) => !service },
        ),
        connectivityStatus: node.connectivityStatus,
        metadata: {
            groupId,
            matter_node_id: matterNodeId,
            matterNodeId,
            isRmngMatterHybrid: true,
            rmngMatterMergedData: scopedMergedData,
            Matter: routingMeta,
            ...(options?.localMatterMetadata?.matter_data
                ? { matter_data: options.localMatterMetadata.matter_data }
                : {}),
        },
        operations,
        isPrimaryUser: true,
        transportOrder: matterNodeId
            ? [MATTER_LOCAL_TRANSPORT_KEY, MQTT_TRANSPORT_KEY]
            : [MQTT_TRANSPORT_KEY],
        availableTransports,
        _raw: {
            ...node,
            _rmngSdkNode: node,
            _routingNode: routingNode,
        },
    });

    (cdfNode as { isMatter?: boolean }).isMatter = true;
    (cdfNode as { matterNodeId?: string }).matterNodeId = matterNodeId;
    (cdfNode as { nodeType?: string }).nodeType = "rmng_matter";

    cdfNode.onPropertyChange(createRmngPropertyChangeSyncCallback(node, cdfNode));
    cdfNode.onPropertyChange(createRoutingPropertyChangeSyncCallback(routingNode));

    syncAvailableTransportsToRmngSdkNode(
        node,
        availableTransports as Record<string, ESPCDFTransportConfig>,
    );
    node.refreshMqttTransport?.();

    bindHybridMatterMqttParamsBridge(cdfNode, node);

    void attachHybridSdkMqttSubscription(node, matterNodeId).catch((error: unknown) => {
        console.warn(
            "[buildRmngHybridMatterCdfNode] SDK MQTT re-attach failed",
            nodeId,
            error,
        );
    });

    console.log("[buildRmngHybridMatterCdfNode] built", {
        nodeId,
        matterNodeId,
        deviceNames: devices.map((d) => d.name),
        hasRoutingNode: !!routingNode,
        endpointCount: Object.keys(
            (mergedData.endpoints as Record<string, unknown> | undefined) ?? {},
        ).length,
        paramNames: devices.flatMap((d) => d.params?.map((p) => p.name) ?? []),
    });

    const user = ESPCDF.instance?.userStore?.user;
    void retrySubscribeForNodeId(user, nodeId, { rawNode: node }).catch((error: unknown) => {
        console.warn(
            "[buildRmngHybridMatterCdfNode] post-build subscribe retry failed",
            nodeId,
            error,
        );
    });

    return cdfNode;
}
