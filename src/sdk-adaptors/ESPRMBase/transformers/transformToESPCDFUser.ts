/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import {
    ESPCDFCreateGroupRequest,
    ESPCDFGroup,
    ESPCDFUser,
    ESPCDFUserInfo,
    ESPCDFGroupSharingRequest,
    ESPCDFProvisioningDevice,
    ESPCDFAPIDataResponse,
    ESPCDFPaginatedAPIResponse,
    ESPCDFNode,
    ESPCDFUserOperation,
    ESPCDFAPIResponse,
    ESPCDFSubscribeToNodeUpdatesRequestParams,
    ESPCDFAssumeRoleRequest,
    ESPCDFAssumeRoleResponse,
} from "@store";
import { mapNodeUpdateDataToEvent } from "@shared/utils/subscriptionHelper";
import { ESPRMUser, ESPSecurity, ESPTransport, ESPRMEventType, UserCustomDataRequest, ESPGroupSharingRequest, ESPRMGroup, ESPRMBase, ESPNodeUpdateData, ESPRMNode } from "@espressif/rainmaker-base-sdk";
import { ESPRMBaseAdaptorIdentifier } from "../constants";
import { syncHomeWithNodes as esprmSyncHomeWithNodes, setCurrentHome as esprmSetCurrentHome, createHome as esprmCreateHome } from "../groupSync";
import { addDeviceProvision } from "../addDeviceProvision";
import { addOnNetworkDeviceProvision } from "../addOnNetworkDeviceProvision";
import { transformToESPCDFGroup } from "./transformToESPCDFGroup";
import { transformToESPCDFGroupSharingRequest } from "./transformToESPCDFGroupSharingRequest";
import { transformToESPCDFProvisioningDevice } from "./transformToESPCDFProvisioningDevice";
import { transformToESPCDFNode } from "./transformToESPCDFNode";

/**
 * Transforms ESPRMUser from the RainMaker SDK to ESPCDFUser format.
 *
 * This utility converts the SDK user object to the CDF user format with:
 * - User info (id, name, email, nickname, phone)
 * - Operations wrapper that delegates to ESPRMUser methods
 * - Raw reference to the original ESPRMUser
 * @param esprmUser - The ESPRMUser instance from the SDK
 * @param identifier - The adaptor identifier
 * @param cdfContext - Optional CDF context for operations
 * @returns ESPCDFUser instance with all required operations
 */
export function transformToESPCDFUser(
    esprmUser: ESPRMUser | null,
): ESPCDFUser {
    if (!esprmUser) {
        throw new Error("ESPRMUser is required for transformation");
    }

    const getUserInfoFromESPRMUser = async (): Promise<ESPCDFUserInfo> => {
        try {
            // Try to get user info via the SDK method
            const userInfo = await esprmUser.getUserInfo();
            return {
                id: userInfo.userId,
                name: userInfo.name || '',
                email: userInfo.username || '',
                nickname: userInfo.name || undefined,
                phone: userInfo.phoneNumber || undefined,

            }
        } catch (error) {
            throw error;
        }
    };

    // Initial user info (will be populated asynchronously)
    const initialUserInfo: ESPCDFUserInfo = {
        id: '',
        name: '',
        email: '',
    };

    const subscribedNodeIdList: string[] = [];

    // Create operations object that wraps ESPRMUser methods
    const operations: ESPCDFUserOperation = {
        async getUserInfo(): Promise<ESPCDFAPIDataResponse<ESPCDFUserInfo>> {
            const userInfo = await getUserInfoFromESPRMUser();
            return {
                status: "success",
                description: "User info fetched successfully",
                data: userInfo,
            };
        },

        async updateUserInfo(userInfo: ESPCDFUserInfo): Promise<ESPCDFAPIResponse> {
            // ESPRMUser doesn't have a direct updateUserInfo method
            // We'll update name if provided
            if (userInfo.name) {
                return await esprmUser.updateName(userInfo.name);
            }
            // Note: Other fields might need separate SDK methods if available
            return {
                status: "success",
                description: "User info updated successfully",
            };
        },

        async getCustomData(): Promise<any> {
            return await esprmUser.getCustomData();
        },

        async setCustomData(customData: UserCustomDataRequest): Promise<void> {
            // ESPRMUser might have custom data methods
            const rawUser = esprmUser;
            await rawUser.setCustomData(customData);
        },

        async changePassword(oldPassword: string, newPassword: string): Promise<ESPCDFAPIResponse> {
            return await esprmUser.changePassword(oldPassword, newPassword);
        },

        async updateName(name: string): Promise<ESPCDFAPIResponse> {
            return await esprmUser.updateName(name);
        },

        async requestAccountDeletion(): Promise<ESPCDFAPIResponse> {
            return await esprmUser.requestAccountDeletion();
        },

        async confirmAccountDeletion(code: string): Promise<ESPCDFAPIResponse> {
            return await esprmUser.confirmAccountDeletion(code);
        },

        async registerForNotification(platform: string, deviceToken: string): Promise<ESPCDFAPIDataResponse> {
            const response = await esprmUser.createPlatformEndpoint({
                platform: platform,
                deviceToken: deviceToken,
            });
            return {
                status: "success",
                description: "Notification endpoint created successfully",
                data: response,
            };
        },

        async unregisterForNotification(deviceToken: string): Promise<ESPCDFAPIResponse> {
            return await esprmUser.deleteEndpoint(deviceToken, "");
        },

        async getIssuedGroupSharingRequests(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>> {
            const response = await esprmUser.getIssuedGroupSharingRequests();

            // Transform sharedRequests object (keyed by status) to unified entities
            let transformedSharedRequests: ESPCDFGroupSharingRequest[] = [];
            if (response?.sharedRequests) {
                transformedSharedRequests = response.sharedRequests.map((req: ESPGroupSharingRequest) =>
                    transformToESPCDFGroupSharingRequest(req)
                );
            }

            // Transform fetchNext if it exists
            let transformedFetchNext: (() => Promise<any>) | undefined;
            if (response?.fetchNext) {
                transformedFetchNext = async () => {
                    const nextResponse = await response.fetchNext?.();
                    let nextTransformedSharedRequests: ESPCDFGroupSharingRequest[] = [];
                    if (nextResponse?.sharedRequests) {
                        nextTransformedSharedRequests = nextResponse.sharedRequests.map((req: ESPGroupSharingRequest) =>
                            transformToESPCDFGroupSharingRequest(req)
                        );
                    }
                    return {
                        status: "success",
                        description: "Issued group sharing requests fetched successfully",
                        data: nextTransformedSharedRequests,
                        pagination: {
                            fetchNext: nextResponse?.fetchNext,
                            hasNext: nextResponse?.hasNext || false,
                        }
                    };
                };
            }

            return {
                status: "success",
                description: "Issued group sharing requests fetched successfully",
                data: transformedSharedRequests,
                pagination: {
                    fetchNext: transformedFetchNext,
                    hasNext: response?.hasNext || false,
                }
            };
        },

        async getReceivedGroupSharingRequests(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>> {
            const response = await esprmUser.getReceivedGroupSharingRequests();

            // Transform sharedRequests object (keyed by status) to unified entities
            let transformedSharedRequests: ESPCDFGroupSharingRequest[] = [];
            if (response?.sharedRequests) {
                transformedSharedRequests = response.sharedRequests.map((req: ESPGroupSharingRequest) =>
                    transformToESPCDFGroupSharingRequest(req)
                );
            }

            // Transform fetchNext if it exists
            let transformedFetchNext: (() => Promise<any>) | undefined;
            if (response?.fetchNext) {
                transformedFetchNext = async () => {
                    const nextResponse = await response.fetchNext?.();
                    let nextTransformedSharedRequests: ESPCDFGroupSharingRequest[] = [];
                    if (nextResponse?.sharedRequests) {
                        nextTransformedSharedRequests = nextResponse.sharedRequests.map((req: ESPGroupSharingRequest) =>
                            transformToESPCDFGroupSharingRequest(req)
                        );
                    }
                    return {
                        status: "success",
                        description: "Received group sharing requests fetched successfully",
                        data: nextTransformedSharedRequests,
                        pagination: {
                            fetchNext: nextResponse?.fetchNext,
                            hasNext: nextResponse?.hasNext || false,
                        }
                    };
                };
            }

            return {
                status: "success",
                description: "Received group sharing requests fetched successfully",
                data: transformedSharedRequests,
                pagination: {
                    fetchNext: transformedFetchNext,
                    hasNext: response?.hasNext || false,
                }
            };
        },

        async logout(): Promise<void> {
            await esprmUser.logout();
        },
        async setTimeZone(timezone: string): Promise<ESPCDFAPIResponse> {
            return await esprmUser.setTimeZone(timezone);
        },
        async createGroup(data: ESPCDFCreateGroupRequest): Promise<ESPCDFGroup> {
            const group = await esprmUser.createGroup(data);
            return transformToESPCDFGroup(group, esprmUser, ESPRMBaseAdaptorIdentifier);
        },
        async searchESPBLEDevices(customerId: number): Promise<ESPCDFProvisioningDevice[]> {
            const devices = await esprmUser.searchESPBLEDevices(customerId);
            return devices.map((device: any) => transformToESPCDFProvisioningDevice(device));
        },
        async searchESPDevices(devicePrefix: string, transport: string): Promise<ESPCDFProvisioningDevice[]> {
            const devices = await esprmUser.searchESPDevices(devicePrefix, transport as ESPTransport);
            return devices.map((device: any) => transformToESPCDFProvisioningDevice(device));
        },
        async createProvisioningDevice(
            name: string,
            transport: string,
            security?: number,
            proofOfPossession?: string,
            softAPPassword?: string,
            username?: string
        ): Promise<ESPCDFProvisioningDevice> {
            const espDevice = await esprmUser.createESPDevice(
                name,
                transport as ESPTransport,
                security as ESPSecurity,
                proofOfPossession,
                softAPPassword,
                username
            );
            return transformToESPCDFProvisioningDevice(espDevice);
        },
        async getGroupById(groupId: string, options: Record<string, any>): Promise<any> {
            const getGroupByIdRequest = {
                id: groupId,
                withNodeDetails: options.withNodeDetails || false,
                withSubGroups: options.withSubGroups || false,
            };
            return await esprmUser.getGroupById(getGroupByIdRequest);
        },
        async subscribeToEvent(event: string, callback: (event: any) => void): Promise<void> {
            esprmUser.subscribe(event as ESPRMEventType, callback);
        },
        async unsubscribeFromEvent(event: string, callback: (event: any) => void): Promise<void> {
            esprmUser.unsubscribe(event as ESPRMEventType, callback);
        },
        async setMultipleNodesParams(payload: { nodeId: string; payload: any }[]): Promise<any> {
            return await esprmUser.setMultipleNodesParams(payload);
        },
        async getGroups(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>> {
            const getGroupsParams = { withNodeList: true, withSubGroups: true };
            const groupsResponse = await esprmUser.getGroups(getGroupsParams);
            const groups = groupsResponse.groups || [];
            const cdfGroups: ESPCDFGroup[] = groups.map((group: ESPRMGroup) =>
                transformToESPCDFGroup(group, esprmUser, ESPRMBaseAdaptorIdentifier)
            );

            // Recursive wrapper function to maintain transformation across all pagination calls
            const wrapFetchNext = (sdkFetchNext: (() => Promise<any>) | undefined): (() => Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>>) | undefined => {
                if (!sdkFetchNext) {
                    return undefined;
                }
                return async () => {
                    const nextGroupsResponse = await sdkFetchNext();
                    const nextGroups = nextGroupsResponse?.groups || [];
                    const nextCdfGroups: ESPCDFGroup[] = nextGroups.map((group: ESPRMGroup) =>
                        transformToESPCDFGroup(group, esprmUser, ESPRMBaseAdaptorIdentifier)
                    );
                    return {
                        data: nextCdfGroups,
                        pagination: {
                            hasNext: nextGroupsResponse?.hasNext || false,
                            fetchNext: wrapFetchNext(nextGroupsResponse?.fetchNext)
                        }
                    } as ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>;
                };
            };

            return {
                data: cdfGroups,
                pagination: {
                    hasNext: groupsResponse.hasNext || false,
                    fetchNext: wrapFetchNext(groupsResponse.fetchNext)
                }
            } as ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>;
        },
        async getNodeDetails(nodeId: string): Promise<ESPCDFNode> {
            const node = await esprmUser.getNodeDetails(nodeId);
            return transformToESPCDFNode(node);
        },
        async getAccessToken(): Promise<string> {
            return await ESPRMUser.getAccessToken();
        },
        async syncHomeWithNodes(user, callbacks) {
            return esprmSyncHomeWithNodes(user as ESPCDFUser, callbacks);
        },
        async setCurrentHome(user, callbacks, home) {
            return esprmSetCurrentHome(user as ESPCDFUser, callbacks, home);
        },
        async createHome(params, callbacks) {
            const newHome = await esprmCreateHome(esprmUser, params);
            const cdfHome = transformToESPCDFGroup(newHome, esprmUser, ESPRMBaseAdaptorIdentifier);
            callbacks.addGroup(cdfHome);
            return cdfHome;
        },
        async addDevice(user, params, callbacks) {
            return addDeviceProvision(user as ESPCDFUser, params, callbacks);
        },
        async addOnNetworkDevice(user, params, callbacks) {
            return addOnNetworkDeviceProvision(user as ESPCDFUser, params, callbacks);
        },

        async subscribeToNodeUpdates(params: ESPCDFSubscribeToNodeUpdatesRequestParams): Promise<void> {
            const subscriptionManager = ESPRMBase.subscriptionManager;
            const sdkNodes = params.nodeList.map((node) => node._raw as ESPRMNode);
            const handleNodeUpdate = (update: ESPNodeUpdateData) => {
                const nodeUpdateEvent = mapNodeUpdateDataToEvent(update);
                params.onNodeUpdate?.(nodeUpdateEvent);
            };

            await subscriptionManager.subscribeToAllNodes(sdkNodes, handleNodeUpdate);
            subscribedNodeIdList.length = 0;
            subscribedNodeIdList.push(...sdkNodes.map((node) => node.id));
        },

        async unsubscribeFromNodeUpdates(): Promise<void> {
            for (const nodeId of subscribedNodeIdList) {
                await ESPRMBase.subscriptionManager.unsubscribeFromNode(nodeId);
            }
            subscribedNodeIdList.length = 0;
        },

        async assumeRole(request: ESPCDFAssumeRoleRequest): Promise<ESPCDFAssumeRoleResponse> {
            return await esprmUser.assumeRole(request);
        },
    };

    // Create ESPCDFUser instance
    const cdfUser = new ESPCDFUser({
        userInfo: initialUserInfo,
        operations: operations,
        _raw: esprmUser,
        identifier: ESPRMBaseAdaptorIdentifier,
    });

    // Fetch and update user info asynchronously
    getUserInfoFromESPRMUser()
        .then((userInfo) => {
            cdfUser.userInfo = userInfo;
        })
        .catch((error) => {
            console.error("[transformToESPCDFUser] Failed to fetch initial user info:", error);
        });

    return cdfUser;
}