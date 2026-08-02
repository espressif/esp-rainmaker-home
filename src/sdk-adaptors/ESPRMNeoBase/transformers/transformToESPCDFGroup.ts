/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDFGroupSharingInfoInterface,
    ESPCDFNode,
    ESPCDFScene,
    ESPCDFSchedule,
    ESPCDFAutomation,
    ESPSDKAdaptorAPIDataResponse,
    ESPCDFPaginatedAPIResponse,
    ESPCDFAutomationCreateInput,
    ESPCDFGroupOperation,
    ESPCDFScheduleCreateInput,
    ESPCDFAPIResponse,
    ESPCDFDevice,
    ESPCDFGroup,
    ESPCDF,
} from "@store";
import {
    ESPRMNeoAutomation,
    ESPRMNeoGroup,
    ESPRMNeoUser,
} from "@espressif/rainmaker-neo-base-sdk";
import { transformToESPCDFAutomation } from "./transformToESPCDFAutomation";
import { transformToESPCDFSchedule } from "./transformToESPCDFSchedule";
import {
    assertCanCreateAutomation,
    createAutomationShell,
    resolveAutomationTriggerDetails,
    syncAutomationTriggersAndActions,
    toResolvedAutomationEvents,
} from "../utils/helpers/automationHelpers";
import {
    normalizeRmneoSdkResponseToCdf,
    throwNormalizedRmneoError,
    throwNormalizedRmneoShareError,
} from "../utils/helpers/sharedHelpers";
import {
    buildCdfGroupSharingInfoFromRmneoUsers,
    buildCdfNodesFromGroup,
    buildRmneoGroupSetParamsPayloadFromBroadcast,
    buildRmneoSubgroupSharingInfo,
    emptyAndDeleteRmneoGroup,
    fetchRmneoSchedulesForHomeGroup,
    isChildGroup,
    isGroupNotEmptyError,
    mergeRmneoSchedulesById,
    resolveRmneoGroupUserAccessTypeForCdf,
    resyncMqttAfterSubgroupChange,
} from "../utils/helpers/groupHelpers";
import i18n from "@/i18n";
import {
    ESPRMNEO_GROUP_SHARING_SCOPE_PARENT,
    ESPRMNEO_GROUP_ERR_CREATE_SUBGROUP_ON_SUBGROUP,
    ESPRMNEO_GROUP_ERR_UPDATE_METADATA_UNSUPPORTED,
    ESPRMNEO_GROUP_ERR_ADD_NODES_ON_HOME,
    ESPRMNEO_GROUP_ERR_REMOVE_NODES_ON_HOME,
    ESPRMNEO_GROUP_ERR_CREATE_SCENE_UNSUPPORTED,
    ESPRMNEO_GROUP_ERR_GET_SCENES_UNSUPPORTED,
    ESPRMNEO_GROUP_ERR_CREATE_SCHEDULE_ON_SUBGROUP,
    ESPRMNEO_GROUP_ERR_GET_SCHEDULES_ON_SUBGROUP,
    ESPRMNEO_GROUP_ERR_GET_AUTOMATIONS_ON_SUBGROUP,
    ESPRMNEO_GROUP_ERR_DELETE_FAILED,
    ESPRMNEO_GROUP_ERR_REMOVE_SHARING_FAILED,
    ESPRMNEO_GROUP_DESC_DELETED,
    ESPRMNEO_GROUP_DESC_NAME_UPDATED,
    ESPRMNEO_GROUP_DESC_NODES_ADDED,
    ESPRMNEO_GROUP_DESC_NODES_REMOVED,
    ESPRMNEO_GROUP_DESC_LEFT,
    ESPRMNEO_GROUP_DESC_AUTOMATIONS_FETCHED,
    ESPRMNEO_GROUP_I18N_ROOM_NOT_EMPTY,
    ESPRMNEO_GROUP_I18N_HOME_NOT_EMPTY,
    formatRmneoSharingUserNotFound,
    formatRmneoSharingRemovedDescription,
} from "../utils/constants";
import {
    GROUP_TYPE_HOME,
    GROUP_TYPE_ROOM,
    GROUP_USER_ACCESS_PRIMARY,
    GROUP_USER_ACCESS_SECONDARY,
    SUCESS,
} from "@shared/utils/constants";
import { parseGroupParamBroadcastEnvelope } from "@shared/utils/groupParamBroadcastEnvelope";

/**
 * Maps an RMNeo SDK group to {@link ESPCDFGroup} with CDF operations.
 * Used by {@link ESPRMNeoBaseSDKAdaptor} paths (no Matter imports or routing).
 * @param group - RMNeo group (home or room) to transform
 * @param user - Logged-in RMNeo user for subgroup MQTT resync and SDK calls
 * @param identifier - Adaptor identifier stamped on the CDF entity
 * @param inheritedUserAccess - When a nested room omits `accessType`, reuse the parent home’s access
 * @returns CDF group with wired operations
 */
export function transformToESPCDFGroup(
    group: ESPRMNeoGroup,
    user: ESPRMNeoUser,
    identifier: string,
    inheritedUserAccess?: string,
): ESPCDFGroup {
    const accessType = resolveRmneoGroupUserAccessTypeForCdf(group, inheritedUserAccess);
    let cdfGroup: ESPCDFGroup;
    const operations: ESPCDFGroupOperation = {
        /**
         * Loads all CDF nodes in this group subtree and caches them on the store.
         * @returns CDF nodes for the group (and nested subgroups)
         */
        async getNodes(): Promise<ESPCDFNode[]> {
            const cdf = await ESPCDF.instance;
            const nodes = await buildCdfNodesFromGroup(group);
            cdf?.groupStore.updateGroup(group.groupId, { nodeDetails: nodes });
            return nodes;
        },
        /**
         * Maps this home's room subgroups to CDF groups; empty for a room itself.
         * @returns CDF subgroups, or `[]` when called on a child group
         */
        async getSubGroups(): Promise<ESPCDFGroup[]> {
            if (isChildGroup(group)) {
                return [];
            }
            const subgroups = group.subgroups;
            return subgroups?.map((subgroup: ESPRMNeoGroup) =>
                transformToESPCDFGroup(subgroup, user, identifier, accessType),
            ) || [];
        },
        /**
         * Creates a room (subgroup) under this home, optionally seeding it with
         * nodes and resyncing their MQTT shadow registration.
         * @param options - New subgroup name and optional initial `nodeIds`
         * @returns The created room as a CDF group
         */
        async createSubGroup(options: {
            name: string;
            nodeIds?: string[];
            description?: string;
            customData?: Record<string, unknown>;
            type?: string;
            mutuallyExclusive?: boolean;
            metadata?: Record<string, unknown>;
        }): Promise<ESPCDFGroup> {
            if (isChildGroup(group)) {
                throw new Error(ESPRMNEO_GROUP_ERR_CREATE_SUBGROUP_ON_SUBGROUP);
            }
            const subgroup = await group.createSubGroup(options.name);
            if (options.nodeIds?.length) {
                await Promise.all(options.nodeIds.map((nodeId) => subgroup.addNode(nodeId)));
                await resyncMqttAfterSubgroupChange(user, options.nodeIds);
            }
            subgroup.nodeIds = options.nodeIds ?? [];
            return transformToESPCDFGroup(subgroup, user, identifier, accessType);
        },
        /**
         * Returns CDF sharing info for this group: subgroup-scoped for rooms,
         * full member list for homes. Caches raw users on `_raw.sharingInfo` for
         * later remove-member UX.
         * @param _options - Ignored (RMNeo derives scope from group type)
         * @returns Adaptor response wrapping the CDF sharing info payload
         */
        async getSharingInfo(_options: {
            metadata?: boolean;
            withSubGroups?: boolean;
            withParentGroups?: boolean;
        }): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFGroupSharingInfoInterface>> {
            if (isChildGroup(group)) {
                const data = await buildRmneoSubgroupSharingInfo(group, cdfGroup);
                return Promise.resolve({
                    data,
                    status: SUCESS,
                });
            }
            const listResponse = await group.getSharingInfo();
            const users = listResponse?.users ?? [];
            cdfGroup._raw.sharingInfo = users;
            return Promise.resolve({
                data: buildCdfGroupSharingInfoFromRmneoUsers({
                    groupId: group.groupId,
                    users,
                    scope: ESPRMNEO_GROUP_SHARING_SCOPE_PARENT,
                }),
                status: SUCESS,
            });
        },
        /**
         * Empties and deletes this group/subgroup, then resyncs MQTT for the
         * nodes it held. Maps the cloud "not empty" 409 to a localized message.
         * @returns CDF response describing the delete outcome
         */
        async delete(): Promise<ESPCDFAPIResponse> {
            // Snapshot before delete: emptyAndDeleteRmneoGroup removes these nodes from
            // this subgroup (or, for a root/home group, from the whole subtree) via raw
            // SDK calls that bypass addNodes/removeNodes, so resync must be triggered here.
            const nodeIdsBeforeDelete = group.nodeIds ?? [];
            try {
                const response = await emptyAndDeleteRmneoGroup(group);
                await resyncMqttAfterSubgroupChange(user, nodeIdsBeforeDelete);
                return normalizeRmneoSdkResponseToCdf(response, ESPRMNEO_GROUP_DESC_DELETED);
            } catch (error) {
                // Cloud rejects non-empty groups/subgroups with 409 ("group/subgroup
                // not empty"). Swap that raw message for a localized, actionable one;
                // throwNormalizedRmneoError keeps `status` on the re-thrown error.
                if (isGroupNotEmptyError(error)) {
                    const message = isChildGroup(group)
                        ? i18n.t(ESPRMNEO_GROUP_I18N_ROOM_NOT_EMPTY)
                        : i18n.t(ESPRMNEO_GROUP_I18N_HOME_NOT_EMPTY);
                    throwNormalizedRmneoError(error, ESPRMNEO_GROUP_ERR_DELETE_FAILED, message);
                }
                throwNormalizedRmneoError(error, ESPRMNEO_GROUP_ERR_DELETE_FAILED);
            }
        },
        /**
         * Not supported by the RMNeoBase SDK.
         * @param _metadata - Ignored
         * @throws Always — group metadata updates are unavailable
         */
        async updateMetadata(_metadata: Record<string, unknown>): Promise<ESPCDFAPIResponse> {
            throw new Error(ESPRMNEO_GROUP_ERR_UPDATE_METADATA_UNSUPPORTED);
        },
        /**
         * Renames this group.
         * @param updates - New `groupName`
         * @returns CDF success response
         */
        async updateGroupInfo(updates: { groupName: string }): Promise<ESPCDFAPIResponse> {
            await group.updateName(updates.groupName);
            return { status: SUCESS, description: ESPRMNEO_GROUP_DESC_NAME_UPDATED };
        },
        /**
         * Adds nodes to a room (subgroup) and resyncs their MQTT shadow.
         * Homes do not support direct node adds in the RMNeoBase SDK.
         * @param nodeIds - Node ids to add to the room
         * @returns CDF success response
         * @throws When called on a home (non-subgroup) group
         */
        async addNodes(nodeIds: string[]): Promise<ESPCDFAPIResponse> {
            if (isChildGroup(group)) {
                await Promise.all(nodeIds.map(async (nodeId) => {
                    return await group.addNode(nodeId);
                }));
                await resyncMqttAfterSubgroupChange(user, nodeIds);
                return { status: SUCESS, description: ESPRMNEO_GROUP_DESC_NODES_ADDED };
            }
            throw new Error(ESPRMNEO_GROUP_ERR_ADD_NODES_ON_HOME);
        },
        /**
         * Removes nodes from a room (subgroup) and resyncs their MQTT shadow.
         * Homes do not support direct node removal in the RMNeoBase SDK.
         * @param nodeIds - Node ids to remove from the room
         * @returns CDF success response
         * @throws When called on a home (non-subgroup) group
         */
        async removeNodes(nodeIds: string[]): Promise<ESPCDFAPIResponse> {
            if (isChildGroup(group)) {
                await Promise.all(nodeIds.map(async (nodeId) => {
                    return await group.removeNode(nodeId);
                }));
                await resyncMqttAfterSubgroupChange(user, nodeIds);
                return { status: SUCESS, description: ESPRMNEO_GROUP_DESC_NODES_REMOVED };
            }
            throw new Error(ESPRMNEO_GROUP_ERR_REMOVE_NODES_ON_HOME);
        },
        /**
         * Leaves a shared group and resyncs MQTT for the nodes it held.
         * @returns CDF response describing the leave outcome
         */
        async leave(): Promise<ESPCDFAPIResponse> {
            const nodeIdsBeforeLeave = group.nodeIds ?? [];
            const response = await group.leave();
            await resyncMqttAfterSubgroupChange(user, nodeIdsBeforeLeave);
            return normalizeRmneoSdkResponseToCdf(response, ESPRMNEO_GROUP_DESC_LEFT);
        },
        /**
         * Shares this group with another user as primary or secondary.
         * Maps Neo `{ message, request_id }` into CDF `{ status, description }` so the UI can toast `message`.
         * @param params - Target `toUserName` and whether to grant primary access
         * @returns CDF success response with API `message` as `description` when present
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ESPCDFGroupOperation.share types Promise<string>; Neo returns ESPCDFAPIResponse
        async share(params: { toUserName: string; makePrimary: boolean }): Promise<any> {
            try {
                const response = await group.share({
                    username: params.toUserName,
                    accessType: params.makePrimary
                        ? GROUP_USER_ACCESS_PRIMARY
                        : GROUP_USER_ACCESS_SECONDARY,
                });
                return normalizeRmneoSdkResponseToCdf(response);
            } catch (error) {
                throwNormalizedRmneoShareError(error);
            }
        },
        /**
         * Transfers primary ownership of this group to another user (Neo: share as primary).
         * Maps Neo `{ message, request_id }` into CDF `{ status, description }` so the UI can toast `message`.
         * @param params - Target `toUserName` to make primary owner
         * @returns CDF success response with API `message` as `description` when present
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ESPCDFGroupOperation.transfer types Promise<string>; Neo returns ESPCDFAPIResponse
        async transfer(params: { toUserName: string }): Promise<any> {
            try {
                const response = await group.share({
                    username: params.toUserName,
                    accessType: GROUP_USER_ACCESS_PRIMARY,
                });
                return normalizeRmneoSdkResponseToCdf(response);
            } catch (error) {
                throwNormalizedRmneoShareError(error);
            }
        },
        /**
         * Revokes a member's access, resolving them from cached sharing info by
         * email, phone, or user id.
         * @param username - Member email / phone / user id to remove
         * @returns CDF success response
         * @throws When the user is not found in cached sharing info
         */
        async removeSharingFor(username: string): Promise<ESPCDFAPIResponse> {
            const sharingInfo = cdfGroup._raw.sharingInfo as
                | { email?: string; phoneNumber?: string; userId: string }[]
                | undefined;
            const member = sharingInfo?.find(
                (u) =>
                    u.email === username ||
                    u.phoneNumber === username ||
                    u.userId === username,
            );
            if (!member) {
                throw new Error(formatRmneoSharingUserNotFound(username));
            }
            try {
                await group.removeMember(member.userId);
            } catch (error) {
                throwNormalizedRmneoError(error, ESPRMNEO_GROUP_ERR_REMOVE_SHARING_FAILED);
            }
            return Promise.resolve({
                status: SUCESS,
                description: formatRmneoSharingRemovedDescription(username),
            });
        },
        /**
         * Not supported by the RMNeoBase SDK.
         * @param _sceneData - Ignored
         * @throws Always — scenes are unavailable
         */
        async createScene(_sceneData: {
            id?: string;
            name: string;
            info?: string;
            nodes?: string[];
            actions: { [key: string]: { [key: string]: unknown } };
        }): Promise<ESPCDFScene> {
            throw new Error(ESPRMNEO_GROUP_ERR_CREATE_SCENE_UNSUPPORTED);
        },
        /**
         * Not supported by the RMNeoBase SDK.
         * @throws Always — scenes are unavailable
         */
        async getScenes(): Promise<ESPCDFScene[]> {
            throw new Error(ESPRMNEO_GROUP_ERR_GET_SCENES_UNSUPPORTED);
        },
        /**
         * Creates a schedule for this home. The backend write happens lazily via
         * the returned schedule's add/edit/remove ops.
         * @param scheduleData - CDF schedule definition (name, triggers, action, …)
         * @returns CDF schedule bound to this group
         * @throws When called on a room (subgroup)
         */
        async createSchedule(scheduleData: ESPCDFScheduleCreateInput): Promise<ESPCDFSchedule> {
            if (isChildGroup(group)) {
                throw new Error(ESPRMNEO_GROUP_ERR_CREATE_SCHEDULE_ON_SUBGROUP);
            }
            const groupId = group.groupId;
            const merged = {
                id: scheduleData.id,
                name: scheduleData.name,
                info: scheduleData.info ?? "",
                nodes: scheduleData.nodes ?? [],
                triggers: scheduleData.triggers ?? [],
                action: scheduleData.action,
                enabled: scheduleData.enabled,
                validity: scheduleData.validity,
                flags: scheduleData.flags,
                adaptorIdentifier: identifier,
            };
            // Backend operation is performed by schedule.add()/edit()/remove() via transformToESPCDFSchedule
            return transformToESPCDFSchedule(merged, identifier, groupId, {
                getNode: (nodeId) => group.getNode(nodeId),
            });
        },
        /**
         * Lists schedules for this home, including nodes that live only on room
         * subgroups. SDK `group.getSchedules()` iterates `this.nodeIds` only;
         * Neo room membership often lists nodes on subgroups, so we fan out
         * via {@link fetchRmneoSchedulesForHomeGroup} + {@link mergeRmneoSchedulesById}.
         * @returns Merged ESPCDFSchedule list (same schedule id across nodes collapsed)
         */
        async getSchedules(): Promise<ESPCDFSchedule[]> {
            if (isChildGroup(group)) {
                throw new Error(ESPRMNEO_GROUP_ERR_GET_SCHEDULES_ON_SUBGROUP);
            }
            const rmneoSchedules = await fetchRmneoSchedulesForHomeGroup(group);
            return mergeRmneoSchedulesById(rmneoSchedules).map((data) =>
                transformToESPCDFSchedule(
                    { ...data, adaptorIdentifier: identifier },
                    identifier,
                    group.groupId,
                    { getNode: (nodeId) => group.getNode(nodeId) },
                ),
            );
        },
        /**
         * Creates an automation on this home: creates the automation first to
         * obtain its id, then adds `nodeId~automationId~random` triggers and
         * links them via `conditions.and`.
         * @param automationData - CDF automation input (name, nodeId, events, actions, …)
         * @returns CDF automation with CRUD ops
         * @throws When called on a room, or when `nodeId` is missing
         */
        async createAutomation(
            automationData: ESPCDFAutomationCreateInput,
        ): Promise<ESPCDFAutomation> {
            const nodeId = assertCanCreateAutomation(group, automationData.nodeId);
            // Create automation first to get automation.id, then add triggers with nodeId~automationId~randomNumber IDs
            const automation = await createAutomationShell(group, automationData);
            await syncAutomationTriggersAndActions(group, nodeId, automation, automationData);
            return transformToESPCDFAutomation(automation, identifier, {
                resolvedEvents: toResolvedAutomationEvents(automationData.events),
                nodeId,
                getNode: (id) => group.getNode(id),
            });
        },
        /**
         * Lists this home's automations, resolving each one's trigger conditions
         * into CDF events for the UI.
         * @returns Paginated CDF automations (single page; no server pagination)
         * @throws When called on a room (subgroup)
         */
        async getAutomations(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>> {
            if (isChildGroup(group)) {
                throw new Error(ESPRMNEO_GROUP_ERR_GET_AUTOMATIONS_ON_SUBGROUP);
            }

            const automations = await group.getAutomations();
            const cdfAutomations = await Promise.all(
                automations.map(async (automation: ESPRMNeoAutomation) =>
                    transformToESPCDFAutomation(automation, identifier, {
                        resolvedEvents: await resolveAutomationTriggerDetails(group, automation),
                        getNode: (nodeId) => group.getNode(nodeId),
                    }),
                ),
            );

            return {
                status: SUCESS,
                description: ESPRMNEO_GROUP_DESC_AUTOMATIONS_FETCHED,
                data: cdfAutomations,
                pagination: {
                    hasNext: false,
                    fetchNext: undefined,
                },
            };
        },
        /**
         * Lists devices (with params) across this group's nodes that can hold a
         * schedule. Reuses cached `nodeDetails` when present, else fetches nodes.
         * @param espcdfGroup - CDF group whose cached node details are preferred
         * @returns Node/device pairs eligible for scheduling
         */
        async getScheduleCapableDevices(espcdfGroup: ESPCDFGroup): Promise<{
            node: ESPCDFNode;
            device: ESPCDFDevice;
            isMaxScheduleReached: boolean;
        }[]> {
            const nodes = espcdfGroup.nodeDetails?.length
                ? espcdfGroup.nodeDetails
                : await buildCdfNodesFromGroup(group);

            return nodes.flatMap((node) =>
                (node.devices ?? [])
                    .filter((device) => (device.params?.length ?? 0) > 0)
                    .map((device) => ({
                        node,
                        device,
                        isMaxScheduleReached: false,
                    })),
            );
        },
        /**
         * Sets group params. A plain payload passes through; a broadcast envelope
         * is reshaped via {@link buildRmneoGroupSetParamsPayloadFromBroadcast}.
         * @param payload - Raw params map or a group param broadcast envelope
         * @returns SDK setParams result, or resolved when nothing to broadcast
         */
        async setParams(
            payload: Record<string, Record<string, unknown>>,
        ): Promise<unknown> {
            const broadcast = parseGroupParamBroadcastEnvelope(payload);
            if (!broadcast) {
                return group.setParams(payload);
            }
            const rmneoGroupPayload =
                buildRmneoGroupSetParamsPayloadFromBroadcast(broadcast);
            if (!rmneoGroupPayload) {
                return Promise.resolve();
            }
            return group.setParams(rmneoGroupPayload);
        },
    };

    const rawGroup = group as { nodeIds?: string[]; node_ids?: string[] };
    const groupNodeIds = rawGroup.nodeIds ?? rawGroup.node_ids ?? [];

    if (isChildGroup(group)) {
        cdfGroup = new ESPCDFGroup({
            identifier,
            id: group.subgroupId ?? group.groupId,
            name: group.subgroupName ?? group.groupName ?? "",
            nodeIds: groupNodeIds,
            nodeDetails: [],
            parentId: group.parentId,
            mutuallyExclusive: true, // Hardcoded as mutually exclusive by default (homes)
            type: GROUP_TYPE_ROOM,
            isPrimaryUser: accessType === GROUP_USER_ACCESS_PRIMARY,
            accessType,
            subGroups: [],
            operations,
            _raw: group,
        });
        return cdfGroup;
    }

    cdfGroup = new ESPCDFGroup({
        identifier: identifier,
        id: group.groupId,
        name: group.groupName || "",
        nodeIds: groupNodeIds,
        nodeDetails: [],
        mutuallyExclusive: true, // Hardcoded as mutually exclusive by default (homes)
        type: GROUP_TYPE_HOME,
        isPrimaryUser: accessType === GROUP_USER_ACCESS_PRIMARY,
        accessType,
        subGroups:
            group.subgroups?.map((subgroup: ESPRMNeoGroup) =>
                transformToESPCDFGroup(subgroup, user, identifier, accessType),
            ) || [],
        operations: operations,
        _raw: group,
    });
    return cdfGroup;
}
