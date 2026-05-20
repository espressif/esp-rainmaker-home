/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFGroupSharingInfoInterface, ESPCDFNode, ESPCDFScene, ESPCDFSchedule, ESPCDFAutomation, ESPSDKAdaptorAPIResponse, ESPSDKAdaptorAPIDataResponse, ESPCDFPaginatedAPIResponse, ESPCDFAutomationCreateInput, ESPCDFGroupOperation, ESPCDFDevice } from "@store";
import { ESPCDFGroup } from "@store";
import {
    ESPRMGroup,
    ESPRMUser,
    ESPAutomationDetails,
    ESPAutomation,
    ESPPaginatedAutomationsResponse,
    type DeviceParams,
    type MultipleNodePayload,
    type NodePayload,
} from "@espressif/rainmaker-base-sdk";
import { transformToESPCDFNodes } from "./transformToESPCDFNode";
import { transformToESPCDFScene } from "./transformToESPCDFScene";
import { transformToESPCDFSchedule } from "./transformToESPCDFSchedule";
import { transformToESPCDFAutomation } from "./transformToESPCDFAutomation";
import { transformToESPAutomationActions } from "../utils/automation";
import { ESPRM_SCENES_SERVICE, ESPRM_PARAM_SCENES, ESPRM_SCHEDULES_SERVICE, ESPRM_PARAM_SCHEDULES } from "../constants";
import { deepClone } from "@shared/utils/common";

export function transformToESPCDFGroup(
    group: ESPRMGroup,
    user: ESPRMUser,
    identifier: string,
): ESPCDFGroup {
    const operations: ESPCDFGroupOperation = {
        async getNodes(): Promise<ESPCDFNode[]> {
            const nodes = await group.getNodesWithDetails();
            return transformToESPCDFNodes(nodes, "group.getNodes");
        },
        async getSubGroups(): Promise<ESPCDFGroup[]> {
            const subGroups = await group.getSubGroups();
            return subGroups.map((subGroup: ESPRMGroup) => transformToESPCDFGroup(subGroup, user, identifier));
        },

        async createSubGroup(options: { name: string; nodeIds?: string[]; description?: string; customData?: Record<string, any>; type?: string; mutuallyExclusive?: boolean; metadata?: Record<string, any> }): Promise<ESPCDFGroup> {
            const subGroup = await group.createSubGroup(options);
            return transformToESPCDFGroup(subGroup, user, identifier);
        },

        async getSharingInfo(options: { metadata?: boolean; withSubGroups?: boolean; withParentGroups?: boolean }): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFGroupSharingInfoInterface>> {
            const res = await group.getSharingInfo(options);
            return {
                data: res,
                status: 'success',
            };
        },

        async delete(): Promise<ESPSDKAdaptorAPIResponse> {
            return await group.delete();
        },

        async updateMetadata(metadata: Record<string, any>): Promise<ESPSDKAdaptorAPIResponse> {
            return await group.updateMetadata(metadata);
        },
        async updateGroupInfo(updates: { groupName?: string }): Promise<ESPSDKAdaptorAPIResponse> {
            return await group.updateGroupInfo(updates);
        },
        async addNodes(nodeIds: string[]): Promise<ESPSDKAdaptorAPIResponse> {
            return await group.addNodes(nodeIds);
        },
        async removeNodes(nodeIds: string[]): Promise<ESPSDKAdaptorAPIResponse> {
            return await group.removeNodes(nodeIds);
        },
        async leave(): Promise<ESPSDKAdaptorAPIResponse> {
            return await group.leave();
        },
        async share(params: { toUserName: string; makePrimary: boolean }): Promise<string> {
            return await group.Share(params);
        },
        async transfer(params: { toUserName: string }): Promise<string> {
            return await group.transfer(params);
        },
        async removeSharingFor(username: string): Promise<ESPSDKAdaptorAPIResponse> {
            return await group.removeSharingFor(username);
        },
        async createScene(sceneData: { id?: string; name: string; info?: string; nodes?: string[]; actions: { [key: string]: { [key: string]: any } } }): Promise<ESPCDFScene> {
            try {
                return transformToESPCDFScene(sceneData, user, identifier);
            } catch (error) {
                throw error;
            }
        },
        async getSceneCapableDevices(espcdfGroup: ESPCDFGroup): Promise<{
            node: ESPCDFNode;
            device: ESPCDFDevice;
            isMaxSceneReached: boolean;
        }[]> {
            try {
                // Use nodeDetails from ESPCDFGroup instance to get latest data
                const nodeDetails = espcdfGroup.nodeDetails || [];

                // Nodes that expose the scenes service
                const nodesWithScenesService = nodeDetails.filter((node: ESPCDFNode) =>
                    node?.services?.some(
                        (service) => service.type === ESPRM_SCENES_SERVICE
                    )
                );

                // One row per device (with params) for scene selection UIs
                const allDevices: {
                    node: ESPCDFNode;
                    device: ESPCDFDevice;
                    isMaxSceneReached: boolean;
                }[] = [];

                nodesWithScenesService.forEach((node) => {
                    const devices = node.devices ?? [];
                    const scene = node.services?.find(
                        (service) => service.type === ESPRM_SCENES_SERVICE
                    )?.params?.[0] as any;

                    const isMaxSceneReached =
                        scene && scene.bounds?.max && scene.bounds.max === scene.value.length;

                    devices
                        .filter((device) => device.params && device.params.length > 0)
                        .forEach((device) => {
                            allDevices.push({
                                node: deepClone(node),
                                device: deepClone(device),
                                isMaxSceneReached,
                            });
                        });
                });

                return allDevices;
            } catch (error) {
                throw error;
            }
        },
        async getScheduleCapableDevices(espcdfGroup: ESPCDFGroup): Promise<{
            node: ESPCDFNode;
            device: ESPCDFDevice;
            isMaxSceneReached: boolean;
        }[]> {
            try {
                // Use nodeDetails from ESPCDFGroup instance to get latest data
                const nodeDetails = espcdfGroup.nodeDetails || [];

                // Nodes that expose the schedules service
                const nodesWithSchedulesService = nodeDetails.filter((node: ESPCDFNode) =>
                    node?.services?.some(
                        (service) => service.type === ESPRM_SCHEDULES_SERVICE
                    )
                );

                // One row per device (with params) for schedule selection UIs
                const allDevices: {
                    node: ESPCDFNode;
                    device: ESPCDFDevice;
                    isMaxSceneReached: boolean;
                }[] = [];

                nodesWithSchedulesService.forEach((node) => {
                    const devices = node.devices ?? [];
                    const schedule = node.services?.find(
                        (service) => service.type === ESPRM_SCHEDULES_SERVICE
                    )?.params?.[0] as any;

                    const isMaxSceneReached =
                        schedule && schedule.bounds?.max && schedule.bounds.max === schedule.value.length;

                    devices
                        .filter((device) => device.params && device.params.length > 0)
                        .forEach((device) => {
                            allDevices.push({
                                node: deepClone(node),
                                device: deepClone(device),
                                isMaxSceneReached,
                            });
                        });
                });

                return allDevices;
            } catch (error) {
                throw error;
            }
        },
        async getScenes(_espcdfGroup: ESPCDFGroup): Promise<ESPCDFScene[]> {
            try {
                // Fetch nodes from cloud, including nodes from subgroups recursively
                const getAllNodes = async (currentGroup: ESPRMGroup): Promise<ESPCDFNode[]> => {
                    // Fetch nodes from cloud for current group
                    const nodes = await currentGroup.getNodesWithDetails();
                    const transformedNodes = transformToESPCDFNodes(nodes, "group.getScenes");

                    // Fetch subgroups from cloud and recursively get their nodes
                    const subGroups = await currentGroup.getSubGroups();
                    const subGroupNodesPromises = subGroups.map((subGroup) =>
                        getAllNodes(subGroup)
                    );
                    const subGroupNodesArrays = await Promise.all(subGroupNodesPromises);
                    const subGroupNodes = subGroupNodesArrays.flat();

                    return [...transformedNodes, ...subGroupNodes];
                };

                // Get all nodes from the group and its subgroups (fetched from cloud)
                const allNodes = await getAllNodes(group);

                // Extract scenes from all nodes and merge them
                const scenesMap = new Map<string, {
                    id: string;
                    name: string;
                    info?: string;
                    nodes: string[];
                    actions: { [key: string]: { [key: string]: any } };
                    devicesCount: number;
                }>();

                allNodes.forEach((node: ESPCDFNode) => {
                    // Find scene service in node
                    const sceneService = node.services?.find(
                        (service: any) => service.type === ESPRM_SCENES_SERVICE
                    );

                    if (!sceneService) return;

                    // Get scene list from service params
                    const sceneList = sceneService.params?.find(
                        (param: any) => param.type === ESPRM_PARAM_SCENES
                    )?.value || [];

                    // Process each scene from this node
                    sceneList.forEach((sceneData: any) => {
                        // Skip scenes that don't have both id and name (required for ESPCDFScene)
                        if (!sceneData.id || !sceneData.name) {
                            return;
                        }

                        const sceneId = sceneData.id;

                        if (scenesMap.has(sceneId)) {
                            // Merge with existing scene
                            const existingScene = scenesMap.get(sceneId)!;
                            const isNewNode = !existingScene.nodes.includes(node.id);
                            if (isNewNode) {
                                existingScene.nodes.push(node.id);
                                existingScene.devicesCount += Object.keys(sceneData.action || {}).length;
                            }
                            existingScene.actions[node.id] = sceneData.action || {};
                        } else {
                            // Create new scene entry
                            scenesMap.set(sceneId, {
                                id: sceneId,
                                name: sceneData.name,
                                info: sceneData.info || '',
                                nodes: [node.id],
                                actions: { [node.id]: sceneData.action || {} },
                                devicesCount: Object.keys(sceneData.action || {}).length,
                            });
                        }
                    });
                });

                // Transform all scenes to ESPCDFScene entities
                // Filter out any scenes that still don't have both id and name (defensive check)
                const scenes: ESPCDFScene[] = Array.from(scenesMap.values())
                    .filter((sceneData) => {
                        if (!sceneData.id || !sceneData.name) {
                            return false;
                        }
                        return true;
                    })
                    .map((sceneData) => {
                        return transformToESPCDFScene(
                            {
                                id: sceneData.id,
                                name: sceneData.name,
                                info: sceneData.info,
                                nodes: sceneData.nodes,
                                actions: sceneData.actions,
                                devicesCount: sceneData.devicesCount,
                                adaptorIdentifier: identifier,
                            },
                            user,
                            identifier
                        );
                    });

                return scenes;
            } catch (error) {
                throw error;
            }
        },
        async createSchedule(scheduleData: {
            id?: string;
            name: string;
            info?: string;
            nodes?: string[];
            triggers: {
                m?: number;
                d?: number;
                dd?: number;
                mm?: number;
                yy?: number;
                rsec?: number;
            }[];
            action: {
                [key: string]: {
                    [key: string]: any;
                };
            };
            enabled?: boolean;
            validity?: {
                start?: number;
                end?: number;
            };
            flags?: number;
        }): Promise<ESPCDFSchedule> {
            try {
                return transformToESPCDFSchedule(scheduleData, user, identifier);
            } catch (error) {
                throw error;
            }
        },
        async getSchedules(_espcdfGroup: ESPCDFGroup): Promise<ESPCDFSchedule[]> {
            try {
                // Fetch nodes from cloud, including nodes from subgroups recursively
                const getAllNodes = async (currentGroup: ESPRMGroup): Promise<ESPCDFNode[]> => {
                    // Fetch nodes from cloud for current group
                    const nodes = await currentGroup.getNodesWithDetails();
                    const transformedNodes = transformToESPCDFNodes(nodes, "group.getSchedules");

                    // Fetch subgroups from cloud and recursively get their nodes
                    const subGroups = await currentGroup.getSubGroups();
                    const subGroupNodesPromises = subGroups.map((subGroup) =>
                        getAllNodes(subGroup)
                    );
                    const subGroupNodesArrays = await Promise.all(subGroupNodesPromises);
                    const subGroupNodes = subGroupNodesArrays.flat();

                    return [...transformedNodes, ...subGroupNodes];
                };

                // Get all nodes from the group and its subgroups (fetched from cloud)
                const allNodes = await getAllNodes(group);

                // Extract schedules from all nodes and merge them
                const schedulesMap = new Map<string, {
                    id: string;
                    name: string;
                    info?: string;
                    nodes: string[];
                    triggers: {
                        m?: number;
                        d?: number;
                        dd?: number;
                        mm?: number;
                        yy?: number;
                        rsec?: number;
                    }[];
                    action: { [key: string]: { [key: string]: any } };
                    enabled?: boolean;
                    validity?: {
                        start?: number;
                        end?: number;
                    };
                    flags?: number;
                    devicesCount: number;
                }>();

                allNodes.forEach((node: ESPCDFNode) => {
                    // Find schedule service in node
                    const scheduleService = node.services?.find(
                        (service: any) => service.type === ESPRM_SCHEDULES_SERVICE
                    );

                    if (!scheduleService) return;

                    // Get schedule list from service params
                    const scheduleList = scheduleService.params?.find(
                        (param: any) => param.type === ESPRM_PARAM_SCHEDULES
                    )?.value || [];

                    // Handle array or object with Schedules property
                    let schedulesArray: any[] = [];
                    if (Array.isArray(scheduleList)) {
                        schedulesArray = scheduleList;
                    } else if (scheduleList && Array.isArray(scheduleList.Schedules)) {
                        schedulesArray = scheduleList.Schedules;
                    }

                    // Process each schedule from this node
                    schedulesArray.forEach((scheduleData: any) => {
                        // Skip schedules that don't have both id and name (required for ESPCDFSchedule)
                        if (!scheduleData.id || !scheduleData.name) {
                            return;
                        }

                        const scheduleId = scheduleData.id;

                        if (schedulesMap.has(scheduleId)) {
                            // Merge with existing schedule
                            const existingSchedule = schedulesMap.get(scheduleId)!;
                            const isNewNode = !existingSchedule.nodes.includes(node.id);
                            if (isNewNode) {
                                existingSchedule.nodes.push(node.id);
                                existingSchedule.devicesCount += Object.keys(scheduleData.action || {}).length;
                            }
                            existingSchedule.action[node.id] = scheduleData.action || {};
                        } else {
                            // Create new schedule entry
                            schedulesMap.set(scheduleId, {
                                id: scheduleId,
                                name: scheduleData.name || '',
                                info: scheduleData.info || '',
                                nodes: [node.id],
                                triggers: scheduleData.triggers || [],
                                action: { [node.id]: scheduleData.action || {} },
                                enabled: scheduleData.enabled,
                                validity: scheduleData.validity,
                                flags: scheduleData.flags,
                                devicesCount: Object.keys(scheduleData.action || {}).length,
                            });
                        }
                    });
                });

                // Transform all schedules to ESPCDFSchedule entities
                // Filter out any schedules that still don't have both id and name (defensive check)
                const schedules: ESPCDFSchedule[] = Array.from(schedulesMap.values())
                    .filter((scheduleData) => {
                        if (!scheduleData.id || !scheduleData.name) {
                            return false;
                        }
                        return true;
                    })
                    .map((scheduleData) => {
                        return transformToESPCDFSchedule(
                            {
                                id: scheduleData.id,
                                name: scheduleData.name,
                                info: scheduleData.info,
                                nodes: scheduleData.nodes,
                                triggers: scheduleData.triggers,
                                action: scheduleData.action,
                                enabled: scheduleData.enabled,
                                validity: scheduleData.validity,
                                flags: scheduleData.flags,
                                devicesCount: scheduleData.devicesCount,
                                adaptorIdentifier: identifier,
                            },
                            user,
                            identifier
                        );
                    });

                return schedules;
            } catch (error) {
                throw error;
            }
        },
        async createAutomation(automationData: ESPCDFAutomationCreateInput): Promise<ESPCDFAutomation> {
            try {
                // Get the node to create automation on
                const nodeId = automationData.nodeId;
                if (!nodeId) {
                    throw new Error("nodeId is required to create automation");
                }

                const targetNode = await user.getNodeDetails(nodeId);

                // Transform automation data to ESPAutomationDetails format
                const automationDetails: ESPAutomationDetails = {
                    name: automationData.name,
                    events: automationData.events.map((event: any) => {
                        // Handle different event types
                        if (event.deviceName && event.param) {
                            return {
                                deviceName: event.deviceName,
                                param: event.param,
                                value: event.value,
                                check: event.check,
                            };
                        }
                        return event;
                    }),
                    eventOperator: automationData.eventOperator as any,
                    retrigger: automationData.retrigger ?? false,
                    actions: transformToESPAutomationActions(
                        automationData.actions,
                    ),
                    ...(automationData.metadata && { metadata: automationData.metadata }),
                };

                // Create automation using node's addAutomation method
                const espAutomation = await targetNode.addAutomation(automationDetails);

                // Transform to ESPCDFAutomation
                return transformToESPCDFAutomation(espAutomation, identifier);
            } catch (error) {
                throw error;
            }
        },
        async getAutomations(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>> {
            try {
                // Get all automations from the user
                const paginatedAutomationsResponse = await user.getAutomations();
                // Remove duplicates based on automationId
                const automationsArray: ESPCDFAutomation[] = paginatedAutomationsResponse.automations.map((automation: ESPAutomation) => {
                    if (automation && automation.automationId) {
                        return transformToESPCDFAutomation(automation, identifier);
                    }
                    return null;
                }).filter((automation: ESPCDFAutomation | null) => automation !== null);
                const wrapFetchNext = (sdkFetchNext: (() => Promise<ESPPaginatedAutomationsResponse>) | undefined): (() => Promise<ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>>) | undefined => {
                    if (!sdkFetchNext) {
                        return undefined;
                    }
                    return async () => {
                        const nextAutomationsResponse = await sdkFetchNext();
                        const nextAutomationsArray: ESPCDFAutomation[] = nextAutomationsResponse.automations.map((automation: ESPAutomation) => {
                            if (automation && automation.automationId) {
                                return transformToESPCDFAutomation(automation, identifier);
                            }
                            return null;
                        }).filter((automation: ESPCDFAutomation | null) => automation !== null);
                        return {
                            status: 'success',
                            description: 'Automations fetched successfully',
                            data: nextAutomationsArray,
                            pagination: {
                                hasNext: nextAutomationsResponse.hasNext,
                                fetchNext: wrapFetchNext(nextAutomationsResponse.fetchNext),
                            },
                        };
                    };
                };

                return {
                    status: 'success',
                    description: 'Automations fetched successfully',
                    data: automationsArray,
                    pagination: {
                        hasNext: paginatedAutomationsResponse.hasNext,
                        fetchNext: wrapFetchNext(paginatedAutomationsResponse.fetchNext),
                    },
                }
            } catch (error) {
                throw error;
            }
        },

        /**
         * Applies a device-name → param map across nodes via {@link ESPRMUser.setMultipleNodesParams}
         * (same batching path as scenes/schedules). Matches group control UI ({@link ESPCDFGroup.setParams}).
         *
         * Request shape follows SDK {@link NodePayload}: each device maps to a `DeviceParams[]` merged on the server.
         */
        async setParams(
            payload: Record<string, Record<string, unknown>>,
        ): Promise<unknown> {
            const nodes = await group.getNodesWithDetails();
            const batch: MultipleNodePayload[] = [];
            for (const node of nodes) {
                const nodeId =
                    node.id ??
                    (node as { nodeId?: string }).nodeId ??
                    (node as { config?: { node_id?: string } }).config?.node_id ??
                    "";
                if (!nodeId) continue;
                const devices = node.nodeConfig?.devices ?? [];
                const namesOnNode = new Set(devices.map((d) => d.name));
                const slice: Record<string, Record<string, unknown>> = {};
                for (const [deviceName, paramsByName] of Object.entries(payload)) {
                    if (!namesOnNode.has(deviceName)) continue;
                    slice[deviceName] = paramsByName;
                }
                const nodePayload: NodePayload = {};
                for (const [deviceName, paramsByName] of Object.entries(slice)) {
                    nodePayload[deviceName] = [paramsByName as DeviceParams];
                }
                if (Object.keys(nodePayload).length > 0) {
                    batch.push({ nodeId, payload: nodePayload });
                }
            }
            if (batch.length === 0) {
                return Promise.resolve();
            }
            return user.setMultipleNodesParams(batch);
        },
    };

    return new ESPCDFGroup({
        identifier: identifier,
        id: group.id,
        name: group.name || '',
        nodeIds: group.nodes || [],
        nodeDetails: transformToESPCDFNodes(group.nodeDetails || [], "group.nodeDetails"),
        subGroups: group.subGroups?.map((subGroup: ESPRMGroup) => transformToESPCDFGroup(subGroup, user, identifier)) || [],
        parentId: group.parentGroupId || '',
        isPrimaryUser: group.isPrimaryUser || false,
        description: group.description || '',
        customData: group.customData || {},
        metadata: group.metadata || {},
        isMatter: group.isMatter || false,
        fabricId: group.fabricId || '',
        totalNodes: group.totalNodes || 0,
        operations: operations,
        type: group.type || '',
        mutuallyExclusive: group.mutuallyExclusive || false,
        _raw: group,
    });
}
