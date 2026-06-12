/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDFNode,
    ESPCDFNodeConfig,
    ESPCDFNodeOperation,
    type ESPCDFAPIDataResponse,
    type ESPCDFOTAUpdateStatusResponse,
    type ESPCDFPropertyChangeCallback,
    type ESPCDFPropertyChangeEvent,
} from "@store";
import { ESPRMDevice, ESPRMNode, ESPRMService } from "@espressif/rainmaker-base-sdk";
import {
    ESPRM_NAME_PARAM_TYPE,
    HEADLESS_ERROR_UNKNOWN,
} from "@shared/utils/constants";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { syncCdfDeviceDisplayName } from "@sdk-adaptors/shared/utils/common";
import { transformToESPCDFDevice } from "./transformToESPCDFDevice";
import { transformToESPCDFService } from "./transformToESPCDFService";

/**
 * Creates a property change callback that syncs CDF node property updates to raw ESPRMNode
 * This subscribes to typed property change events and updates the raw node accordingly
 * Using fixed event types provides better type safety and maintainability
 * @param rawNode - Mutable SDK node backing the CDF entity.
 * @param cdfNode - Live CDF node whose derived fields (e.g. displayName) stay in sync.
 * @returns Callback invoked on each CDF property change event.
 */
const createPropertyChangeSyncCallback = (
    rawNode: ESPRMNode,
    cdfNode: ESPCDFNode,
): ESPCDFPropertyChangeCallback => {
    return (event: ESPCDFPropertyChangeEvent) => {
        try {
            // Use discriminated union to handle each event type with proper typing
            switch (event.type) {
                case 'deviceParamChanged': {
                    // Find the device in raw node
                    const device = rawNode.nodeConfig?.devices?.find(d => d.name === event.deviceName);
                    if (device) {
                        // Find the param in the device
                        const param = device.params?.find(p => p.name === event.paramName);
                        if (param) {
                            param.value = event.value;
                            if (param.type === ESPRM_NAME_PARAM_TYPE) {
                                syncCdfDeviceDisplayName(cdfNode, event.deviceName);
                            }
                        }
                    }
                    break;
                }

                case 'serviceParamChanged': {
                    // Find the service in raw node
                    const service = rawNode.nodeConfig?.services?.find(s => s.name === event.serviceName);
                    if (service) {
                        // Find the param in the service
                        const param = service.params?.find(p => p.name === event.paramName);
                        if (param) {
                            param.value = event.value;
                        }
                    }
                    break;
                }

                case 'metadataChanged': {
                    // Direct property on node
                    rawNode.metadata = event.metadata;
                    for (const device of cdfNode.devices ?? []) {
                        syncCdfDeviceDisplayName(cdfNode, device.name);
                    }
                    break;
                }

                case 'availableTransportsChanged': {
                    // Direct property on node
                    rawNode.availableTransports = event.availableTransports as typeof rawNode.availableTransports;
                    break;
                }

                case 'connectivityStatusChanged': {
                    // Direct property on node
                    rawNode.connectivityStatus = event.connectivityStatus as typeof rawNode.connectivityStatus;
                    break;
                }

                case 'tagsChanged': {
                    // Direct property on node
                    rawNode.tags = event.tags;
                    break;
                }

                case 'roleChanged': {
                    // Direct property on node
                    rawNode.role = event.role;
                    break;
                }

                default:
                    // Exhaustive check - TypeScript will error if we miss an event type
                    const _exhaustive: never = event;
                    console.error(`[transformToESPCDFNode] Unhandled event type:`, _exhaustive);
            }
        } catch (error) {
            console.error(`[transformToESPCDFNode] Failed to sync event ${event.type} to raw node:`, error);
        }
    };
};

/**
 * Transforms one RM base SDK node into a CDF node entity.
 * Assumes the SDK supplies a well-formed node.
 * @param node - Raw RM base SDK node.
 * @returns Transformed CDF node.
 */
export function transformToESPCDFNode(
    node: ESPRMNode,
): ESPCDFNode {
    const nodeId = node.id;

    const devices = safeTransform<ESPRMDevice, ReturnType<typeof transformToESPCDFDevice>>(
        node.nodeConfig?.devices,
        "node.devices",
        (device) =>
            transformToESPCDFDevice(device, {
                nodeMetadata: node.metadata as Record<string, unknown> | undefined,
            }),
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

    const services = safeTransform<ESPRMService, ReturnType<typeof transformToESPCDFService>>(
        node.nodeConfig?.services,
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

    const nodeConfig: ESPCDFNodeConfig = {
        configVersion: node.nodeConfig?.configVersion!,
        info: node.nodeConfig?.info,
    };

    const operations: ESPCDFNodeOperation = {
        setMultipleParams: async (params: Record<string, any>) => {
            return node.setMultipleParams(params);
        },
        delete: async () => {
            return node.delete();
        },
        setTimeZone: async (timeZone: string) => {
            return node.setTimeZone(timeZone);
        },
        updateMetadata: async (metadata: Record<string, any>) => {
            return node.updateMetadata(metadata);
        },
        checkOTAUpdate: async () => {
            const otaUpdate = await node.checkOTAUpdate?.();
            return {
                status: "success",
                data: otaUpdate,
            };
        },
        pushOTAUpdate: async (params: any) => {
            return node.pushOTAUpdate(params);
        },
        getOTAUpdateStatus: async (otaJobId: string) => {
            const otaUpdateStatus = await node.getOTAUpdateStatus(otaJobId);
            return {
                status: "success",
                description: "OTA update status fetched successfully",
                data: otaUpdateStatus,
            } as ESPCDFAPIDataResponse<ESPCDFOTAUpdateStatusResponse>;
        },
    };

    const cdfNode = new ESPCDFNode({
        ...node,
        identifier: nodeId,
        id: nodeId,
        type: node.type,
        nodeConfig: nodeConfig,
        devices: devices,
        services: services,
        connectivityStatus: node.connectivityStatus,
        metadata: node.metadata,
        tags: node.tags,
        role: node.role,
        operations: operations,
        isPrimaryUser: node.isPrimaryUser ?? true,
        transportOrder: node.transportOrder,
        availableTransports: node.availableTransports,
        _raw: node,
    });

    // Subscribe to property change events to sync to _raw
    // This creates an event-based sync mechanism
    const syncCallback = createPropertyChangeSyncCallback(node, cdfNode);
    cdfNode.onPropertyChange(syncCallback);

    return cdfNode;
}

/**
 * Transforms a batch of SDK nodes to CDF nodes.
 * Invalid nodes are skipped and reported as partial failures.
 * @param nodes - Raw SDK nodes.
 * @param context - Context label for partial failure logs.
 * @returns Successfully transformed CDF nodes.
 */
export function transformToESPCDFNodes(
    nodes: ESPRMNode[],
    context: string
): ESPCDFNode[] {
    const failures: { nodeId: string; index: number; reason: string }[] = [];

    const transformedNodes = safeTransform<ESPRMNode, ESPCDFNode>(
        nodes,
        context,
        (node) => transformToESPCDFNode(node),
        ({ index, context: ctx, error }) => {
            const message = error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
            failures.push({
                nodeId: nodes[index].id,
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
