/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
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
import {
    ESPRMNGMatterNode,
    type ESPRMNGMatterMetadataShape,
    type ESPRMNGMatterMetadataInterface,
    type ESPRMNGMatterDevice,
} from "@espressif/rmng-matter-sdk";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { transformToESPCDFDevice } from "@sdk-adaptors/ESPRMNGBase/transformers/transformToESPCDFDevice";
import { transformToESPCDFService } from "@sdk-adaptors/ESPRMNGBase/transformers/transformToESPCDFService";
import { normalizeRmngSdkResponseToCdf } from "@sdk-adaptors/ESPRMNGBase/utils/common";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { HEADLESS_ERROR_UNKNOWN } from "@shared/utils/constants";
import {
    isRmngMatterHybridNode,
    isRmngPureMatterNode,
    readInnerConfig,
} from "../utils/rmngMatterNodeKind";
import { isBridgeParentNode } from "../bridge/rmngMatterBridgeKind";
import { matterDataToEspMetadata } from "../utils/matterDataToMetadata";
import {
    applyMatterDeviceParamsToCdfNode,
    buildMatterRoutingNode,
    extractParamValuesFromMatterData,
} from "../utils/rmngMatterTopologyHelpers";
import { hasUsableMatterTopology } from "../utils/rmngGroupNodeDetailsContext";
import { buildRmngHybridMatterDevices } from "./buildRmngHybridMatterDevices";
import { normalizeRmngMatterConfigToCompressed } from "../utils/rmngMatterEndpointFormat";
import { ensureRmngSdkNodeMatterSubscribeShape } from "../utils/rmngMatterSubscribeShape";
import type { RmngNodeCapabilityContext } from "@espressif/rmng-matter-sdk";

const DEFAULT_PURE_MATTER_DEVICE_NAME = "Light";
const PURE_MATTER_LOG = "[rmngPureMatter]";

export interface TransformRmngNodeOptions {
    groupId?: string;
    isMatterGroup?: boolean;
    isPureMatter?: boolean;
    isRmngMatterHybrid?: boolean;
    matterNodeIdOverride?: string;
    matterMetadata?: ESPRMNGMatterMetadataShape;
    localMatterMetadata?: Record<string, unknown>;
    rmngMatterMergedData?: Record<string, unknown>;
    storedParams?: Record<string, unknown>;
    /** Capability entry from GET /v1/groups `node_details`. */
    groupNodeCapability?: RmngNodeCapabilityContext;
    /** Pure Matter inferred from group `node_details` (not cloud config). */
    isPureMatterFromGroup?: boolean;
    /** Whether Matter operational discovery has attached local transport. */
    isMatterLocallyReachable?: boolean;
    /** Bridged Matter child under a bridge parent (`{parentId}--{suffix}`). */
    isBridgedRmngMatterChild?: boolean;
    /** Whether persisted local `matter_data` has endpoint topology. */
    hasUsableMatterTopology?: boolean;
    /** Override SDK subscription channel order (e.g. mqtt-only bridged children). */
    subscriptionChannelOrder?: string[];
}

function readNodeConfigRecord(node: ESPRMNGNode): Record<string, unknown> | undefined {
    return node.config as unknown as Record<string, unknown> | undefined;
}

function readMatterMetadataFromNode(
    node: ESPRMNGNode,
    options?: TransformRmngNodeOptions,
): ESPRMNGMatterMetadataShape | undefined {
    if (options?.matterMetadata) return options.matterMetadata;

    const config = readNodeConfigRecord(node);
    const inner = (config?.config ?? config) as Record<string, unknown> | undefined;
    const meta =
        (inner?.Matter as Record<string, unknown> | undefined) ??
        (inner?.matter as Record<string, unknown> | undefined) ??
        (config?.Matter as Record<string, unknown> | undefined) ??
        (config?.matter as Record<string, unknown> | undefined);

    if (meta && typeof meta === "object") {
        return meta as ESPRMNGMatterMetadataShape;
    }

    const localMeta = options?.localMatterMetadata;
    const matterData = localMeta?.matter_data as Record<string, unknown> | undefined;
    const fromLocal = matterDataToEspMetadata(matterData, {
        deviceName: localMeta?.deviceName as string | undefined,
        deviceType: localMeta?.deviceType as number | undefined,
    });
    return fromLocal as ESPRMNGMatterMetadataShape | undefined;
}

function readMatterNodeIdFromNode(
    node: ESPRMNGNode,
    options?: TransformRmngNodeOptions,
): string | undefined {
    if (options?.matterNodeIdOverride?.trim()) {
        return options.matterNodeIdOverride.trim();
    }
    const fromGroupCapability = options?.groupNodeCapability?.matterNodeId?.trim();
    if (fromGroupCapability) {
        return fromGroupCapability;
    }
    const config = readNodeConfigRecord(node);
    const inner = (config?.config ?? config) as Record<string, unknown> | undefined;
    const fromConfig =
        (inner?.matter_node_id as string | undefined) ??
        (inner?.matterNodeId as string | undefined) ??
        (config?.matter_node_id as string | undefined) ??
        (config?.matterNodeId as string | undefined);
    if (typeof fromConfig === "string" && fromConfig.trim()) {
        return fromConfig.trim();
    }
    return undefined;
}

export function isRmngMatterNodeCandidate(
    node: ESPRMNGNode,
    options?: TransformRmngNodeOptions,
): boolean {
    if (isBridgeParentNode(node)) return false;
    if (options?.isPureMatterFromGroup && options.groupNodeCapability?.matterNodeId) {
        return true;
    }
    if (options?.isPureMatter || isRmngPureMatterNode(node)) return true;
    if (isRmngMatterHybridNode(node)) return false;
    if (readMatterMetadataFromNode(node, options)) return true;
    const inner = readInnerConfig(node);
    if (inner?.endpoints && typeof inner.endpoints === "object") return true;
    return !!readMatterNodeIdFromNode(node, options);
}

/** True when the node has real cloud RMNG config (not the minimal `{ config: {} }` shell). */
function hasRealCloudRmngConfig(node: ESPRMNGNode): boolean {
    const config = readNodeConfigRecord(node);
    if (!config) return false;

    const topDevices = (config.devices as unknown[] | undefined) ?? node.devices;
    if (Array.isArray(topDevices) && topDevices.length > 0) return true;

    if (config.Matter || config.matter) return true;

    const nested = config.config as Record<string, unknown> | undefined;
    if (nested && typeof nested === "object" && Object.keys(nested).length > 0) {
        if (
            nested.devices ||
            nested.endpoints ||
            nested.Matter ||
            nested.matter ||
            nested.data_model === "matter"
        ) {
            return true;
        }
    }

    const inner = readInnerConfig(node);
    if (
        inner?.endpoints &&
        typeof inner.endpoints === "object" &&
        Object.keys(inner.endpoints).length > 0
    ) {
        return true;
    }

    return false;
}

function resolveEffectiveMatterMetadata(
    storedMetadata: ESPRMNGMatterMetadataShape | ESPRMNGMatterMetadataInterface | undefined,
    needsMatterOnlyFallback: boolean,
    fallbackDeviceName: string,
    localMatterMetadata?: Record<string, unknown>,
): ESPRMNGMatterMetadataShape | ESPRMNGMatterMetadataInterface | undefined {
    const fromMatterData = matterDataToEspMetadata(
        localMatterMetadata?.matter_data as Record<string, unknown> | undefined,
        {
            deviceName: storedMetadata?.deviceName ?? fallbackDeviceName,
            deviceType: storedMetadata?.deviceType,
        },
    );
    if (fromMatterData?.endpoints && Object.keys(fromMatterData.endpoints).length > 0) {
        return fromMatterData;
    }

    const hasStoredTopology = !!(
        storedMetadata?.endpoints &&
        typeof storedMetadata.endpoints === "object" &&
        Object.keys(storedMetadata.endpoints).length > 0
    );
    if (hasStoredTopology) {
        return storedMetadata;
    }
    if (needsMatterOnlyFallback) {
        return { deviceName: fallbackDeviceName };
    }
    return storedMetadata;
}

function resolveMatterMetadataForCdf(
    matterMetadata:
        | ESPRMNGMatterMetadataShape
        | ESPRMNGMatterMetadataInterface
        | undefined,
    options?: TransformRmngNodeOptions,
):
    | ESPRMNGMatterMetadataShape
    | ESPRMNGMatterMetadataInterface
    | undefined {
    const localMeta = options?.localMatterMetadata;
    if (!hasUsableMatterTopology(localMeta)) {
        return matterMetadata;
    }
    const fromMatterData = matterDataToEspMetadata(
        localMeta?.matter_data as Record<string, unknown> | undefined,
        {
            deviceName: matterMetadata?.deviceName,
            deviceType: matterMetadata?.deviceType,
        },
    );
    return fromMatterData ?? matterMetadata;
}

const createPropertyChangeSyncCallback = (
    sdkDevices: ESPRMNGMatterDevice[] | undefined,
    routingNode: ESPRMNGMatterNode | undefined,
): ESPCDFPropertyChangeCallback => {
    return (event: ESPCDFPropertyChangeEvent) => {
        if (event.type !== "deviceParamChanged") return;

        if (sdkDevices?.length) {
            const device = sdkDevices.find((d) => d.id === event.deviceName);
            const param = device?.params?.find((p) => p.id === event.paramName);
            if (param) {
                param.value = event.value;
                return;
            }
        }

        if (!routingNode) return;
        const device = routingNode.devices?.find((d) => d.id === event.deviceName);
        const param = device?.params?.find((p) => p.id === event.paramName);
        if (param) param.value = event.value;
    };
};

/**
 * Builds a CDF node with Matter local transport + cluster-aware devices (same stack as Rainmaker).
 */
export function buildRmngMatterCdfNode(
    node: ESPRMNGNode,
    options?: TransformRmngNodeOptions,
): ESPCDFNode {
    const nodeId = node.nodeId;
    const groupId = options?.groupId ?? node.groupId ?? "";
    const matterNodeIdForSubscribe = readMatterNodeIdFromNode(node, options);
    if (matterNodeIdForSubscribe) {
        ensureRmngSdkNodeMatterSubscribeShape(
            node,
            nodeId,
            matterNodeIdForSubscribe,
            (options?.isPureMatter ??
                options?.isPureMatterFromGroup ??
                isRmngPureMatterNode(node))
                ? "pure_matter"
                : "rmng_matter",
        );
    }
    const isPureMatter =
        options?.isPureMatter ??
        options?.isPureMatterFromGroup ??
        isRmngPureMatterNode(node);
    const matterNodeId = readMatterNodeIdFromNode(node, options);
    const storedMatterMetadata = readMatterMetadataFromNode(node, options);
    const hasStoredTopology = !!(
        storedMatterMetadata?.endpoints &&
        typeof storedMatterMetadata.endpoints === "object" &&
        Object.keys(storedMatterMetadata.endpoints).length > 0
    );
    const hasRealCloudConfig = hasRealCloudRmngConfig(node);
    const hasUsableLocalTopology =
        options?.hasUsableMatterTopology ??
        hasUsableMatterTopology(options?.localMatterMetadata);
    const needsMatterOnlyFallback =
        isPureMatter &&
        !hasStoredTopology &&
        !hasRealCloudConfig &&
        !hasUsableLocalTopology;
    const fallbackDeviceName =
        storedMatterMetadata?.deviceName ??
        (options?.localMatterMetadata?.deviceName as string | undefined) ??
        DEFAULT_PURE_MATTER_DEVICE_NAME;
    const matterMetadata = resolveEffectiveMatterMetadata(
        storedMatterMetadata,
        needsMatterOnlyFallback,
        fallbackDeviceName,
        options?.localMatterMetadata,
    );
    const matterMetadataForCdf = resolveMatterMetadataForCdf(matterMetadata, options);
    const hasTopology = !!(
        matterMetadata?.endpoints &&
        typeof matterMetadata.endpoints === "object" &&
        Object.keys(matterMetadata.endpoints).length > 0
    );
    const isOfflinePureMatterStub =
        isPureMatter &&
        !!matterNodeId &&
        !hasUsableLocalTopology &&
        !hasStoredTopology &&
        options?.isMatterLocallyReachable !== true;

    const pureMatterLocallyReachable =
      options?.isMatterLocallyReachable === true;

    console.log(`${PURE_MATTER_LOG} buildRmngMatterCdfNode inputs`, {
        nodeId,
        isPureMatter,
        matterNodeId,
        hasStoredTopology,
        hasTopology,
        hasRealCloudConfig,
        needsMatterOnlyFallback,
        effectiveDeviceName: matterMetadata?.deviceName,
        isMatterLocallyReachable: options?.isMatterLocallyReachable,
        hasUsableMatterTopology: options?.hasUsableMatterTopology,
    });

    const storedParamValues =
        options?.storedParams ??
        extractParamValuesFromMatterData(
            options?.localMatterMetadata?.matter_data as Record<string, unknown> | undefined,
        );

    const matterSdkNode = ESPRMNGMatterNode.buildFrom(
        node as unknown as Parameters<typeof ESPRMNGMatterNode.buildFrom>[0],
        {
            identifier: ESPRMNGBaseAdaptorIdentifier,
            groupId,
            matterNodeId,
            matterMetadata: matterMetadata as
                | ESPRMNGMatterMetadataShape
                | Record<string, unknown>,
            storedParams: storedParamValues,
            setValueFactory: (_nodeId, _gid, deviceName, paramName) => async (value) => {
                await node.setParams({ [deviceName]: { [paramName]: value } });
            },
            isMatterOnlyFallback: needsMatterOnlyFallback,
        },
    );

    const payload = matterSdkNode.cdfPayload;
    const sdkDevices =
        matterSdkNode.devices?.length > 0
            ? (matterSdkNode.devices as ESPRMNGMatterDevice[])
            : undefined;
    const routingNode =
        sdkDevices?.length || !matterNodeId || !hasTopology
            ? undefined
            : buildMatterRoutingNode(
                  nodeId,
                  matterNodeId,
                  matterMetadata as ESPRMNGMatterMetadataInterface | undefined,
              );

    const pureMatterDevicesFromLocalTopology = (() => {
        const matterData = options?.localMatterMetadata?.matter_data as
            | Record<string, unknown>
            | undefined;
        if (!matterData?.endpoints || typeof matterData.endpoints !== "object") {
            return undefined;
        }
        if (Object.keys(matterData.endpoints as Record<string, unknown>).length === 0) {
            return undefined;
        }

        const merged = normalizeRmngMatterConfigToCompressed({
            data_model: "matter",
            info: {
                name:
                    matterMetadata?.deviceName ??
                    fallbackDeviceName,
            },
            endpoints: matterData.endpoints as Record<string, unknown>,
        });

        const devices = buildRmngHybridMatterDevices(
            merged as unknown as Record<string, unknown>,
            matterMetadata?.deviceName ?? fallbackDeviceName,
        );
        return devices.length > 0 ? devices : undefined;
    })();

    const devicesSource = sdkDevices?.length
        ? sdkDevices
        : routingNode?.devices?.length
          ? routingNode.devices
          : pureMatterDevicesFromLocalTopology ?? payload.devices;

    const devices = safeTransform(
        devicesSource,
        "matterNode.devices",
        (device) =>
            transformToESPCDFDevice(device as Parameters<typeof transformToESPCDFDevice>[0], {
                nodeMetadata: {
                    matter_node_id: matterNodeId,
                    matterNodeId,
                    Matter: matterMetadata,
                    deviceName:
                        matterMetadata?.deviceName ??
                        (options?.localMatterMetadata?.deviceName as string | undefined) ??
                        DEFAULT_PURE_MATTER_DEVICE_NAME,
                },
            }),
        ({ index, error }) => {
            const message =
                error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
            console.warn("RMNG Matter device transform skipped", {
                nodeId,
                index,
                reason: message,
            });
        },
        { skipElement: (device) => !device },
    );

    const operations: ESPCDFNodeOperation = {
        setMultipleParams: async (_params: Record<string, unknown>) => {
            const res = await node.setParams(_params);
            return normalizeRmngSdkResponseToCdf(res, "Parameters updated successfully");
        },
        delete: async (): Promise<ESPCDFAPIResponse> => {
            const res = await node.delete();
            return normalizeRmngSdkResponseToCdf(res, "Node deleted successfully");
        },
        setTimeZone: async (_timeZone: string) => {
            throw new Error("RMNG Matter node setTimeZone not implemented");
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

    const availableTransports = payload.availableTransports as
        | Partial<Record<string, ESPCDFTransportConfig>>
        | undefined;

    const cdfNode = new ESPCDFNode({
      identifier: ESPRMNGBaseAdaptorIdentifier,
      id: nodeId,
      type: isPureMatter ? "pure_matter" : (payload.type ?? "rmng matter node"),
      nodeConfig: new ESPCDFNodeConfig({
        configVersion: payload.nodeConfig?.configVersion ?? "",
        info: (payload.nodeConfig?.info ?? {}) as ESPCDFNodeInfoInterface,
      }),
      devices,
      services: safeTransform(
        payload.services,
        "matterNode.services",
        (service) =>
          transformToESPCDFService(
            service as Parameters<typeof transformToESPCDFService>[0],
          ),
        () => {},
        { skipElement: (service) => !service },
      ),
      connectivityStatus: isOfflinePureMatterStub
        ? { isConnected: false, lastConnectionTimestamp: Date.now() }
        : isPureMatter
          ? {
              isConnected: pureMatterLocallyReachable,
              lastConnectionTimestamp: Date.now(),
            }
          : payload.connectivityStatus,
      metadata: {
        ...(payload.metadata ?? {}),
        matter_node_id: matterNodeId,
        matterNodeId,
        isRmngMatterHybrid: false,
        ...(matterMetadataForCdf ? { Matter: matterMetadataForCdf } : {}),
        ...(isOfflinePureMatterStub
          ? { isRmngPureMatterOfflineStub: true }
          : {}),
        ...(options?.localMatterMetadata?.matter_data
          ? { matter_data: options.localMatterMetadata.matter_data }
          : {}),
      },
      operations,
      isPrimaryUser: true,
      transportOrder: payload.transportOrder,
      availableTransports,
      _raw: {
        ...matterSdkNode,
        _routingNode: routingNode,
        _sdkDevices: sdkDevices,
        _rmngSdkNode: node,
      },
    });

    (cdfNode as { isMatter?: boolean }).isMatter = true;
    (cdfNode as { matterNodeId?: string }).matterNodeId = matterNodeId;
    (cdfNode as { nodeType?: string }).nodeType = isPureMatter
        ? "pure_matter"
        : "rmng_matter";

    cdfNode.onPropertyChange(
        createPropertyChangeSyncCallback(sdkDevices, routingNode),
    );

    if (storedParamValues && Object.keys(storedParamValues).length > 0) {
        applyMatterDeviceParamsToCdfNode(cdfNode, storedParamValues, undefined, {
            paramDecodeContext: "rewrite_shadow",
        });
    }

    console.log(`${PURE_MATTER_LOG} buildRmngMatterCdfNode built`, {
        nodeId,
        isPureMatter,
        matterNodeId,
        needsMatterOnlyFallback,
        payloadDeviceCount: payload.devices?.length ?? 0,
        payloadDeviceNames: payload.devices?.map((d) => d.name),
        payloadParamNames: payload.devices?.map((d) => d.params?.map((p) => p.name)),
        deviceNames: devices.map((d) => d.name),
        deviceParamNames: devices.map((d) => d.params?.map((p) => p.name)),
        sdkDeviceCount: sdkDevices?.length ?? 0,
        sdkDeviceIds: sdkDevices?.map((d) => d.id),
        hasRoutingNode: !!routingNode,
        routingDeviceNames: routingNode?.devices?.map((d) => d.id),
        isOfflinePureMatterStub,
    });

    return cdfNode;
}
