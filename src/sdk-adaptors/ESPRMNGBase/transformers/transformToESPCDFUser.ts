/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import {
    ESPCDFCreateGroupRequest,
    ESPCDFGroup,
    ESPCDFUser,
    ESPCDFUserInfo,
    ESPCDFUserCustomDataRequest,
    ESPCDFGroupSharingRequest,
    ESPCDFProvisioningDevice,
    ESPCDFAPIDataResponse,
    ESPCDFPaginatedAPIResponse,
    ESPCDFNode,
    ESPCDFUserOperation,
    ESPCDFAPIResponse,
    ESPCDFAssumeRoleRequest,
    ESPCDFAssumeRoleResponse,
    ESPCDFSubscribeToNodeUpdatesRequestParams,
    ESPCDFEventType,
} from "@store";
import {
    ESPDevice,
    ESPRMNGBase,
    ESPRMNGUser,
    ESPRMNGNode,
    ESPTransport,
    decodeToken,
    NodeMQTTOrchestrator,
    type ESPNodeUpdateData,
} from "@espressif/rmng-base-sdk";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { transformToESPCDFGroup } from "./transformToESPCDFGroup";
import {
    createHome as rmngCreateHome,
    setCurrentHome as rmngSetCurrentHome,
    syncHomeWithNodes as rmngSyncHomeWithNodes,
    transformRmngSdkGroupsToCdf,
} from "../groupSync";
import { transformToESPCDFGroupSharingRequest } from "./transformToESPCDFGroupSharingRequest";
import { transformToESPCDFNode } from "./transformToESPCDFNode";
import { createCDFProvisioningDeviceFromAdapterDescriptor } from "./transformToESPCDFProvisioningDevice";
import { addDeviceProvision } from "../utils/addDeviceProvision";
import { orderSdkGroupsForNodeLookup } from "../utils/resolveSdkGroupForNodeId";
import {
    applyRmngAdaptorUserCustomDataPatch,
    getRmngAdaptorUserCustomData,
    resolveRmngUserIdForCustomDataStorage,
} from "../utils/userCustomDataStorage";
import { mapNodeUpdateDataToEvent } from "@shared/utils/subscriptionHelper";
import { emitShadowConnectivityEvents } from "@sdk-adaptors/ESPRMNGBase/utils/common";
import { startRmngLocalDiscoverySubscription } from "../utils/rmngLocalDiscoverySubscription";
import {
    logRmngDeviceParamsRaw,
    logRmngGroupsFabricsRaw,
    logRmngNodeConfigRaw,
} from "../utils/rmngAdaptorDebugLog";
import { filterEspProvisionDevicesByRmngCustomerId } from "../utils/filterRmngBleDevices";
/** Matches User API `POST /v1/app-platforms/{id}/clients` path segment. */
const RMNG_APP_PLATFORM_ID = "virtual-app";

/**
 * Pure-RMNG user transform (no Matter SDK imports). Matter adaptor uses
 * {@link ESPRMNGMatterBase/transformers/transformToESPCDFUser} at login.
 */
export function transformToESPCDFUserBase(
    esprmngUser: ESPRMNGUser | null,
): ESPCDFUser {
    if (!esprmngUser) {
        throw new Error("ESPRMNGUser is required for transformation");
    }

    // Start MQTT connection early; store the promise so operations that need
    // MQTT (e.g. syncHomeWithNodes → getNodes → SDK subscribeToNode) can await it.
    const mqttConnectionPromise = esprmngUser.connectMQTT().catch((error) => {
        console.error("[transformToESPCDFUser] Failed to connect MQTT:", error);
    });

    const getUserInfoFromESPRMNGUser = async (): Promise<ESPCDFUserInfo> => {
        try {
            // Try to get user info via the SDK method first
            const userInfo = await esprmngUser.getUserInfo();
            const email = userInfo.userAttributes.email || userInfo.username || '';
            // Decode idToken to get user ID (cognito:username)
            let userId = userInfo.username;
            try {
                const decodedToken = decodeToken(esprmngUser.idToken);
                userId = decodedToken['cognito:username'] || decodedToken.sub || userInfo.username;
            } catch (tokenError) {
                console.warn("[transformToESPCDFUser] Failed to decode token, using username:", tokenError);
            }

            return {
                id: userId,
                name: email,
                email: email || '',
                nickname: email || undefined,
                phone: userInfo.userAttributes.phone_number || userInfo.userAttributes['custom:phone'] || undefined,
                username: email, // Add username for UI fallback (ProfileSection uses userInfo?.username)
            } as ESPCDFUserInfo & { username?: string };
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

    let discoveryCleanup: (() => void) | null = null;
    const subscribedNodeIdList: string[] = [];

    // Create operations object that wraps ESPRMNGUser methods
    const operations: ESPCDFUserOperation = {
        async getUserInfo(): Promise<ESPCDFAPIDataResponse<ESPCDFUserInfo>> {
            const userInfo = await getUserInfoFromESPRMNGUser();
            return {
                status: "success",
                description: "User info fetched successfully",
                data: userInfo,
            };
        },
        async updateUserInfo(_userInfo: Partial<ESPCDFUserInfo>): Promise<ESPCDFAPIResponse<any>> {
            throw new Error("RMNGBase SDK does not support updateUserInfo");
        },
        async getCustomData(): Promise<any> {
            const userId = await resolveRmngUserIdForCustomDataStorage(esprmngUser);
            if (!userId) {
                console.warn("[transformToESPCDFUser] getCustomData: missing user id for storage key");
                return {};
            }
            return getRmngAdaptorUserCustomData(userId);
        },
        async setCustomData(customData: ESPCDFUserCustomDataRequest): Promise<void> {
            const userId = await resolveRmngUserIdForCustomDataStorage(esprmngUser);
            if (!userId) {
                throw new Error("RMNG adaptor: cannot persist custom data without a resolvable user id");
            }
            await applyRmngAdaptorUserCustomDataPatch(userId, customData);
        },
        async changePassword(oldPassword: string, newPassword: string): Promise<ESPCDFAPIResponse<any>> {
            try {
                // Todo:
                // Not working as expected,
                // Might be error in the SDK,
                // will update later
                const auth = ESPRMNGBase.getAuthInstance();
                await auth.changePassword(oldPassword, newPassword);
                return {
                    status: "success",
                    description: "Password changed successfully",
                };
            } catch (error) {
                console.error("[transformToESPCDFUser] changePassword error:", error);
                throw error;
            }

        },
        async updateName(_name: string): Promise<ESPCDFAPIResponse<any>> {
            console.warn("[transformToESPCDFUser] updateName is not supported by RMNGBase SDK");
            throw new Error("RMNGBase SDK does not support updateName")
        },
        async requestAccountDeletion(): Promise<ESPCDFAPIResponse<any>> {
            console.warn("[transformToESPCDFUser] requestAccountDeletion is not supported by RMNGBase SDK");
            throw new Error("RMNGBase SDK does not support requestAccountDeletion")
        },
        async confirmAccountDeletion(_code: string): Promise<ESPCDFAPIResponse<any>> {
            console.warn("[transformToESPCDFUser] confirmAccountDeletion is not supported by RMNGBase SDK");
            throw new Error("RMNGBase SDK does not support confirmAccountDeletion")
        },
        async getIssuedGroupSharingRequests(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>> {
            return {
                status: "success",
                description: "Issued group sharing requests fetched successfully",
                data: [],
                pagination: {
                    hasNext: false,
                    fetchNext: undefined,
                },
            };
        },
        async getReceivedGroupSharingRequests(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>> {
            const list = await esprmngUser.listSharingRequests();
            const data = list.map((req) => transformToESPCDFGroupSharingRequest(req));
            return {
                status: "success",
                description: "Received group sharing requests fetched successfully",
                data,
                pagination: {
                    hasNext: false,
                    fetchNext: undefined,
                },
            };
        },
        async logout(): Promise<void> {
            NodeMQTTOrchestrator.clear();
            await esprmngUser.logout();
        },
        async setTimeZone(timezone: string): Promise<ESPCDFAPIResponse> {
            await operations.setCustomData({ timeZone: { value: timezone } });
            return {
                status: "success",
                description: "Time zone updated successfully",
            };
        },
        async createGroup(data: ESPCDFCreateGroupRequest): Promise<ESPCDFGroup> {
            const group = await esprmngUser.createGroup(data.name);
            return transformToESPCDFGroup(group, esprmngUser, ESPRMNGBaseAdaptorIdentifier);
        },
        async searchESPBLEDevices(customerId: number): Promise<ESPCDFProvisioningDevice[]> {
            const adapter = ESPRMNGBase.ESPProvisionAdapter;
            if (!adapter) {
                throw new Error("RMNG ESPProvisionAdapter is not configured");
            }
            const rawDevices = await adapter.searchESPDevices("", ESPTransport.ble);
            const filtered = filterEspProvisionDevicesByRmngCustomerId(rawDevices ?? [], customerId);
            return filtered.map((raw) => {
                const device = new ESPDevice(raw);
                Object.assign(device, {
                    advertisementData: raw.advertisementData,
                });
                return createCDFProvisioningDeviceFromAdapterDescriptor(device);
            });
        },
        async searchESPDevices(devicePrefix: string, transport: string): Promise<ESPCDFProvisioningDevice[]> {
            const devices = await esprmngUser.searchESPDevices(devicePrefix, transport as any);
            return devices.map((d) => createCDFProvisioningDeviceFromAdapterDescriptor(d as any));
        },
        async createProvisioningDevice(
            name: string,
            transport: string,
            security?: number,
            proofOfPossession?: string,
            softAPPassword?: string,
            username?: string
        ): Promise<ESPCDFProvisioningDevice> {
            const descriptor = await esprmngUser.createESPDevice(
                name,
                transport as any,
                security,
                proofOfPossession,
                softAPPassword,
                username
            );
            return createCDFProvisioningDeviceFromAdapterDescriptor(descriptor as any);
        },
        async getGroupById(_groupId: string, _options: Record<string, any>): Promise<any> {
            throw new Error("RMNGBase SDK does not support getGroupById");
        },
        async subscribeToEvent(
            event: string,
            callback: (event: unknown) => void,
            _config?: Record<string, unknown>,
        ): Promise<void> {
            if (event === ESPCDFEventType.localDiscovery) {
                discoveryCleanup = await startRmngLocalDiscoverySubscription(callback, esprmngUser);
                return;
            }
            throw new Error(`RMNG SDK does not support subscribeToEvent for event: ${event}`);
        },
        async unsubscribeFromEvent(
            event: string,
            _callback: (event: unknown) => void,
        ): Promise<void> {
            if (event === ESPCDFEventType.localDiscovery) {
                discoveryCleanup?.();
                discoveryCleanup = null;
                return;
            }
        },
        async setMultipleNodesParams(_payload: { nodeId: string; payload: any }[]): Promise<any> {
            throw new Error("RMNGBase SDK does not support setMultipleNodesParams");
        },
        async getGroups(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>> {
            const groups = await esprmngUser.getGroups();
            logRmngGroupsFabricsRaw("getGroups", { sdkGroups: groups });
            const cdfGroups = transformRmngSdkGroupsToCdf(esprmngUser, groups);
            return {
                data: cdfGroups,
                pagination: {
                    hasNext: false,
                    fetchNext: undefined
                }
            } as ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>;
        },
        async getNodeDetails(nodeId: string): Promise<ESPCDFNode> {
            const groups = await esprmngUser.getGroups();
            let lastError: unknown;
            for (const group of orderSdkGroupsForNodeLookup(groups, nodeId)) {
                try {
                    const rmngNode = await group.getNode(nodeId, true);
                    logRmngNodeConfigRaw("user.getNodeDetails", nodeId, rmngNode.config, {
                        groupId: rmngNode.groupId ?? group.groupId,
                        params: (rmngNode as { params?: unknown }).params,
                    });
                    return transformToESPCDFNode(rmngNode);
                } catch (error) {
                    lastError = error;
                }
            }
            if (lastError instanceof Error) {
                throw lastError;
            }
            throw new Error(`Node ${nodeId} not found in any group`);
        },
        async getAccessToken(): Promise<string> {
            return esprmngUser.accessToken;
        },
        async syncHomeWithNodes(user, callbacks) {
            return rmngSyncHomeWithNodes(
                user as ESPCDFUser,
                callbacks,
                esprmngUser,
                mqttConnectionPromise,
            );
        },
        async setCurrentHome(user, callbacks, home) {
            return rmngSetCurrentHome(user as ESPCDFUser, callbacks, home);
        },
        async createHome(params, callbacks) {
            const newHome = await rmngCreateHome(esprmngUser, params);
            const cdfHome = transformToESPCDFGroup(newHome, esprmngUser, ESPRMNGBaseAdaptorIdentifier);
            callbacks.addGroup(cdfHome);
            return cdfHome;
        },
        async addDevice(user, params, callbacks) {
            return addDeviceProvision(user as ESPCDFUser, params, callbacks);
        },
        async registerForNotification(_platform: string, deviceToken: string): Promise<ESPCDFAPIDataResponse<any>> {
            const token = deviceToken?.trim();
            if (token) {
                try {
                    await esprmngUser.registerClient(
                        RMNG_APP_PLATFORM_ID,
                        token
                    );
                } catch (error) {
                    console.warn(
                        "[transformToESPCDFUser] registerForNotification: push token registration failed:",
                        error
                    );
                }
            }
            return {
                status: "success",
                description: token
                    ? "Notification endpoint registered successfully"
                    : "RMNG user code is obtained at sign-in",
                data: null,
            };
        },
        async unregisterForNotification(_deviceToken: string): Promise<ESPCDFAPIResponse> {
            await esprmngUser.unregisterClient(RMNG_APP_PLATFORM_ID);
            return {
                status: "success",
                description: "Notification endpoint unregistered successfully",
            };
        },

        async assumeRole(_request: ESPCDFAssumeRoleRequest): Promise<ESPCDFAssumeRoleResponse> {
            throw new Error("ESPRMNGBase SDK assume role has different implementation which not assume role for particluar nodeId's or groupId's");
        },
        async subscribeToNodeUpdates(
            params: ESPCDFSubscribeToNodeUpdatesRequestParams,
        ): Promise<void> {
            const subscriptionManager = ESPRMNGBase.subscriptionManager;
            const sdkNodes = params.nodeList.map((node) => node._raw as ESPRMNGNode);

            const handleNodeUpdate = (update: ESPNodeUpdateData) => {
                const nodeId = update.nodeId;
                logRmngDeviceParamsRaw(
                    "subscribeToNodeUpdates.handleNodeUpdate",
                    nodeId,
                    update.source === "matter" ? "matter" : "mqtt",
                    update.payload,
                    {
                        source: update.source,
                        metadata: update.metadata,
                    },
                );

                const shadowDoc = (update.metadata as { shadow?: unknown } | undefined)
                    ?.shadow;
                if (shadowDoc) {
                    emitShadowConnectivityEvents(nodeId, shadowDoc, (ev) =>
                        params.onNodeUpdate?.(ev),
                    );
                }

                const nodeUpdateEvent = mapNodeUpdateDataToEvent(update);
                params.onNodeUpdate?.(nodeUpdateEvent);
            };

            try {
                await subscriptionManager.subscribeToAllNodes(
                    sdkNodes,
                    handleNodeUpdate,
                );
            } catch (error) {
                console.warn(
                    "[transformToESPCDFUser] subscribeToAllNodes failed:",
                    error,
                );
            }

            subscribedNodeIdList.length = 0;
            subscribedNodeIdList.push(...sdkNodes.map((node) => node.nodeId));
        },
        async unsubscribeFromNodeUpdates(): Promise<void> {
            for (const nodeId of subscribedNodeIdList) {
                await ESPRMNGBase.subscriptionManager
                    .unsubscribeFromNode(nodeId)
                    .catch(() => {});
            }
            subscribedNodeIdList.length = 0;
        },
    };

    // Create ESPCDFUser instance
    const cdfUser = new ESPCDFUser({
        userInfo: initialUserInfo,
        operations: operations,
        _raw: esprmngUser,
        identifier: ESPRMNGBaseAdaptorIdentifier,
    });

    const syncRmngUserCode = async (): Promise<void> => {
        try {
            const profile = await esprmngUser.getProfile();
            if (profile.user_code) {
                cdfUser.userInfo.userCode = profile.user_code;
            }
        } catch (error) {
            console.warn("[transformToESPCDFUser] Failed to fetch RMNG user code:", error);
        }
    };

    // Fetch profile, then obtain user code (does not depend on FCM/APNs token)
    getUserInfoFromESPRMNGUser()
        .then((userInfo) => {
            cdfUser.userInfo = userInfo;
        })
        .catch((error) => {
            console.warn("[transformToESPCDFUser] Failed to fetch initial user info:", error);
        })
        .finally(() => {
            void syncRmngUserCode();
        });

    return cdfUser;
}

/** Pure RMNG user transform — used by {@link ESPRMNGBaseSDKAdaptor} login. */
export function transformToESPCDFUser(
    esprmngUser: ESPRMNGUser | null,
): ESPCDFUser {
    return transformToESPCDFUserBase(esprmngUser);
}