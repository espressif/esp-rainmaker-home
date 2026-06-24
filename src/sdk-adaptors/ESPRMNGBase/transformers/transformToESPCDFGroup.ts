import { ESPCDFGroupSharingInfoInterface, ESPCDFNode, ESPCDFScene, ESPCDFSchedule, ESPCDFAutomation, ESPSDKAdaptorAPIDataResponse, ESPCDFPaginatedAPIResponse, ESPCDFAutomationCreateInput, ESPCDFGroupOperation, ESPCDFScheduleCreateInput, ESPCDFAPIResponse, ESPCDFDevice } from "@store";
import { ESPCDFGroup } from "@store";
import { ESPRMNGAutomation, ESPRMNGGroup, ESPRMNGNode, ESPRMNGUser } from "@espressif/rmng-base-sdk";
import { transformToESPCDFAutomation, type ResolvedAutomationEvents } from "./transformToESPCDFAutomation";
import { transformToESPCDFNodes } from "./transformToESPCDFNode";
import { transformToESPCDFSchedule } from "./transformToESPCDFSchedule";
import { apiOperatorToTriggerOperator, cdfActionsToTargets, cdfEventsToTriggerItems, triggerItemToCdfEvent } from "../utils/automation";
import { normalizeRmngSdkResponseToCdf, throwNormalizedRmngError, throwNormalizedRmngShareError } from "../utils/common";
import { emptyAndDeleteRmngGroup, isGroupNotEmptyError } from "../utils/groupDeletion";
import i18n from "@/i18n";
import {
    ESPRMNG_GROUP_SHARING_SCOPE_PARENT,
    ESPRMNG_GROUP_SHARING_SCOPE_SUBGROUP_ROOM,
    ESPRMNG_AUTOMATION_STATUS,
} from "../utils/constants";
import { buildCdfGroupSharingInfoFromRmngUsers } from "../utils/rmngGroupSharingTransform";
import {
    GROUP_USER_ACCESS_PRIMARY,
    GROUP_USER_ACCESS_SECONDARY,
    GROUP_USER_ACCESS_SUBGROUP,
} from "@shared/utils/constants";
import { ESPCDF } from "@store";
import { GROUP_CONTROL_PAYLOAD_PARAMS_ENVELOPE_KEY } from "@shared/utils/constants";
import {
    parseGroupParamBroadcastEnvelope,
    resolveGroupParamBroadcastTypeKey,
} from "@shared/utils/groupParamBroadcastEnvelope";

type TriggerNodeLike = { getTriggers?(): Promise<unknown[]>; setTriggers?(items: unknown[]): Promise<unknown> };

type CdfEntry = {
    id: string;
    name: string;
    info?: string;
    nodes: string[];
    triggers: { m?: number; d?: number; dd?: number; mm?: number; yy?: number; rsec?: number }[];
    action: Record<string, Record<string, any>>;
    enabled?: boolean;
    validity?: { start?: number; end?: number };
    flags: number;
    devicesCount: number;
};

/**
 * Builds CDF sharing info for a nested subgroup (room). RMNG SDK rejects
 * {@link ESPRMNGGroup.prototype.getSharingInfo} on child groups; we list the parent
 * group's users and derive primary vs room-scoped secondary members.
 * @param group - Nested RMNG group (room) with `parentId` set
 * @param cdfGroup - CDF group instance whose `_raw.sharingInfo` is updated for remove-member UX
 * @returns Sharing info payload aligned with {@link ESPCDFGroupSharingInfoInterface}
 */
async function buildRmngSubgroupSharingInfoFromParentUsers(
    group: ESPRMNGGroup,
    cdfGroup: ESPCDFGroup,
): Promise<ESPCDFGroupSharingInfoInterface> {
    if (!group.parentId?.trim()) {
        throw new Error("RMNG subgroup missing parentId for sharing info");
    }
    /**
     *  Create a temporary new RMNG group instance to get the sharing info from the parent group.
     *  As rmng-backend does not support getSharingInfo on child groups.
     */
    const parentGroup = new ESPRMNGGroup({
        groupId: group.parentId,
        groupName: group.groupName ?? "",
        nodeIds: [],
    });
    const listResponse = await parentGroup.getSharingInfo();
    const allUsers = listResponse?.users ?? [];
    cdfGroup._raw.sharingInfo = allUsers;

    const scopedSubgroupId = group.groupId;

    return buildCdfGroupSharingInfoFromRmngUsers({
        groupId: scopedSubgroupId,
        users: allUsers,
        scope: ESPRMNG_GROUP_SHARING_SCOPE_SUBGROUP_ROOM,
        scopedSubgroupId,
    });
}

/**
 * Maps RMNG SDK `accessType` (and optional parent inheritance) to CDF `ESPCDFGroup.accessType`.
 *
 * @param group RMNG group instance from the user’s group list
 * @param inheritedUserAccess When the SDK omits `accessType` on a nested subgroup, reuse the parent home’s resolved access
 * @returns One of {@link GROUP_USER_ACCESS_PRIMARY}, {@link GROUP_USER_ACCESS_SECONDARY}, {@link GROUP_USER_ACCESS_SUBGROUP}
 */
function resolveRmngGroupUserAccessTypeForCdf(
    group: ESPRMNGGroup,
    inheritedUserAccess?: string,
): string {
    const fromSdk = group.accessType ?? inheritedUserAccess;
    if (
        fromSdk === GROUP_USER_ACCESS_PRIMARY ||
        fromSdk === GROUP_USER_ACCESS_SECONDARY ||
        fromSdk === GROUP_USER_ACCESS_SUBGROUP
    ) {
        return fromSdk;
    }
    return GROUP_USER_ACCESS_PRIMARY;
}

export function transformToESPCDFGroup(
    group: ESPRMNGGroup,
    user: ESPRMNGUser,
    identifier: string,
    inheritedUserAccess?: string,
): ESPCDFGroup {
    const accessType = resolveRmngGroupUserAccessTypeForCdf(group, inheritedUserAccess);
    const operations: ESPCDFGroupOperation = {
        async getNodes(): Promise<ESPCDFNode[]> {
            const cdf = await ESPCDF.instance;
            const nodes = await buildCdfNodesFromGroup(group, user, identifier)
            cdf?.groupStore.updateGroup(group.groupId, { nodeDetails: nodes });
            return nodes;
        },
        async getSubGroups(): Promise<ESPCDFGroup[]> {
            if (isSubgroup(group)) {
                return [];
            }
            const subgroups = group.subgroups;
            return subgroups?.map((subgroup: ESPRMNGGroup) =>
                transformToESPCDFGroup(subgroup, user, identifier, accessType),
            ) || [];
        },
        async createSubGroup(options: { name: string; nodeIds?: string[]; description?: string; customData?: Record<string, any>; type?: string; mutuallyExclusive?: boolean; metadata?: Record<string, any> }): Promise<ESPCDFGroup> {
            if (isSubgroup(group)) {
                throw new Error("RMNGBase SDK does not support createSubGroup for subgroup");
            }
            const subgroup = await group.createSubGroup(options.name);
            if (options.nodeIds?.length) {
                await Promise.all(options.nodeIds.map((nodeId) => subgroup.addNode(nodeId)));
            }
            subgroup.nodeIds = options.nodeIds;
            return transformToESPCDFGroup(subgroup, user, identifier, accessType);
        },
        async getSharingInfo(_options: { metadata?: boolean; withSubGroups?: boolean; withParentGroups?: boolean }): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFGroupSharingInfoInterface>> {
            if (isSubgroup(group)) {
                const data = await buildRmngSubgroupSharingInfoFromParentUsers(group, cdfGroup);
                return Promise.resolve({
                    data,
                    status: "success",
                });
            }
            const listResponse = await group.getSharingInfo();
            const users = listResponse?.users ?? [];
            cdfGroup._raw.sharingInfo = users;
            return Promise.resolve({
                data: buildCdfGroupSharingInfoFromRmngUsers({
                    groupId: group.groupId,
                    users,
                    scope: ESPRMNG_GROUP_SHARING_SCOPE_PARENT,
                }),
                status: "success",
            });
        },
        async delete(): Promise<ESPCDFAPIResponse> {
            try {
                const response = await emptyAndDeleteRmngGroup(group);
                return normalizeRmngSdkResponseToCdf(response, "Group deleted successfully");
            } catch (error) {
                // Cloud rejects non-empty groups/subgroups with 409 ("group/subgroup
                // not empty"). Swap that raw message for a localized, actionable one;
                // throwNormalizedRmngError keeps `status` on the re-thrown error.
                if (isGroupNotEmptyError(error)) {
                    const message = isSubgroup(group)
                        ? i18n.t("group.errors.roomNotEmpty")
                        : i18n.t("group.errors.homeNotEmpty");
                    throwNormalizedRmngError(error, "Failed to delete group", message);
                }
                throwNormalizedRmngError(error, "Failed to delete group");
            }
        },
        async updateMetadata(_metadata: Record<string, any>): Promise<ESPCDFAPIResponse> {
            throw new Error("RMNGBase SDK does not support updateMetadata");
        },
        async updateGroupInfo(updates: { groupName: string }): Promise<ESPCDFAPIResponse> {
            await group.updateName(updates.groupName);
            return { status: "success", description: "Group name updated successfully" };
        },
        async addNodes(nodeIds: string[]): Promise<ESPCDFAPIResponse> {
            if (isSubgroup(group)) {
                await Promise.all(nodeIds.map(async (nodeId) => {
                    return await group.addNode(nodeId);
                }));
                return { status: "success", description: "Nodes added to subgroup" };
            }
            throw new Error("RMNGBase SDK does not support addNodes for group");
        },
        async removeNodes(nodeIds: string[]): Promise<ESPCDFAPIResponse> {
            if (isSubgroup(group)) {
                await Promise.all(nodeIds.map(async (nodeId) => {
                    return await group.removeNode(nodeId);
                }));
                return { status: "success", description: "Nodes removed from subgroup" };
            }
            throw new Error("RMNGBase SDK does not support removeNodes for group");
        },
        async leave(): Promise<ESPCDFAPIResponse> {
            const response = await group.leave();
            return normalizeRmngSdkResponseToCdf(response, "Left group successfully");
        },
        async share(params: { toUserName: string; makePrimary: boolean }): Promise<any> {
            try {
                return await group.share({
                    userCode: params.toUserName,
                    accessType: params.makePrimary
                        ? GROUP_USER_ACCESS_PRIMARY
                        : GROUP_USER_ACCESS_SECONDARY,
                });
            } catch (error) {
                throwNormalizedRmngShareError(error);
            }
        },
        async transfer(params: { toUserName: string }): Promise<any> {
            return group.share({
                userCode: params.toUserName,
                accessType: GROUP_USER_ACCESS_PRIMARY,
            });
        },
        async removeSharingFor(username: string): Promise<ESPCDFAPIResponse> {
            const sharingInfo = cdfGroup._raw.sharingInfo as
                | { email?: string; phone_number?: string; user_id: string }[]
                | undefined;
            const member = sharingInfo?.find(
                (u) =>
                    u.email === username ||
                    u.phone_number === username ||
                    u.user_id === username,
            );
            if (!member) {
                throw new Error(`User ${username} not found in sharing info`);
            }
            try {
                await group.removeMember(member.user_id);
            } catch (error) {
                console.log(error)
            }
            return Promise.resolve({ status: "success", description: `Sharing removed for user ${username}` });
        },
        async createScene(_sceneData: { id?: string; name: string; info?: string; nodes?: string[]; actions: { [key: string]: { [key: string]: any } } }): Promise<ESPCDFScene> {
            throw new Error("RMNGBase SDK does not support createScene");
        },
        async getScenes(): Promise<ESPCDFScene[]> {
            throw new Error("RMNGBase SDK does not support getScenes");
        },
        async createSchedule(scheduleData: ESPCDFScheduleCreateInput): Promise<ESPCDFSchedule> {
            if (isSubgroup(group)) {
                throw new Error("RMNGBase SDK does not support createSchedule for subgroup");
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
            return transformToESPCDFSchedule(merged, user, identifier, groupId);
        },
        async getSchedules(): Promise<ESPCDFSchedule[]> {
            if (isSubgroup(group)) {
                throw new Error("Subgroup does not support getSchedules");
            }
            const rmngSchedules = await group.getSchedules();
            const schedulesMapById = new Map<string, CdfEntry>();

            for (const schedule of rmngSchedules) {
                const nodeId = schedule.nodeId;
                if (!nodeId) continue;

                const scheduleId = schedule.id
                const deviceAction = schedule.action
                const devicesCount = Object.keys(deviceAction).length;

                const existing = schedulesMapById.get(scheduleId);
                if (existing) {
                    const isNewNode = !existing.nodes.includes(nodeId);
                    if (isNewNode) {
                        existing.nodes.push(nodeId);
                        existing.devicesCount += devicesCount;
                    }
                    existing.action[nodeId] = { ...(existing.action[nodeId] ?? {}), ...deviceAction };
                } else {
                    schedulesMapById.set(scheduleId, {
                        id: scheduleId,
                        name: schedule.name ?? "",
                        info: "",
                        nodes: [nodeId],
                        triggers: schedule.triggers,
                        action: { [nodeId]: deviceAction },
                        enabled: schedule.enabled,
                        validity: schedule.validity,
                        flags: 0,
                        devicesCount,
                    });
                }
            }

            return Array.from(schedulesMapById.values()).map((data) =>
                transformToESPCDFSchedule(
                    { ...data, adaptorIdentifier: identifier },
                    user,
                    identifier,
                    group.groupId,
                )
            );
        },
        async createAutomation(automationData: ESPCDFAutomationCreateInput): Promise<ESPCDFAutomation> {
            if (isSubgroup(group)) {
                throw new Error("RMNGBase SDK does not support createAutomation for subgroup");
            }
            const nodeId = automationData.nodeId;
            if (!nodeId) {
                throw new Error("nodeId is required to create automation");
            }
            const targets = cdfActionsToTargets(automationData.actions);
            // Create automation first to get automation.id, then add triggers with nodeId~automationId~randomNumber IDs
            const automation = await (group as ESPRMNGGroup).createAutomation({
                name: automationData.name,
                conditions: { and: [] },
                actions: { targets: [] },
                status: automationData.enabled ? ESPRMNG_AUTOMATION_STATUS.ENABLED : ESPRMNG_AUTOMATION_STATUS.DISABLED,
                retrigger: automationData.retrigger ?? false,
            });
            const { triggerItems, triggerIds } = cdfEventsToTriggerItems(automationData.events, nodeId, automation.id);
            if (triggerItems.length > 0) {
                const node = await group.getNode(nodeId);
                await Promise.all(triggerItems.map(async (t) => {
                    return await node.addTrigger(t);
                }));
                await automation.update({
                    conditions: { and: triggerIds },
                    actions: { targets },
                });
            }

            const events = Array.isArray(automationData.events) ? automationData.events : [];
            const resolvedEvents: ResolvedAutomationEvents = events
                .filter((e) => typeof e === "object" && e !== null && "deviceName" in e)
                .map((e) => {
                    const o = e as { deviceName?: string; param?: string; check?: string; value?: unknown };
                    return {
                        deviceName: o.deviceName ?? "",
                        param: o.param ?? "",
                        check: o.check ?? "==",
                        value: o.value,
                    };
                });
            return transformToESPCDFAutomation(automation, identifier, {
                resolvedEvents,
                nodeId,
                getNode: (id) => (group as ESPRMNGGroup).getNode(id),
            });
        },
        async getAutomations(): Promise<ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>> {
            if (isSubgroup(group)) {
                throw new Error("RMNGBase SDK does not support getAutomations for subgroup");
            }
            const rmngGroup = group as ESPRMNGGroup;
            const rawList = await rmngGroup.getAutomations();
            const data = await Promise.all(
                rawList.map(async (automation: ESPRMNGAutomation) => {
                    const resolvedEvents = await resolveAutomationTriggerDetails(rmngGroup, automation);
                    return transformToESPCDFAutomation(automation, identifier, {
                        resolvedEvents,
                        getNode: (id) => rmngGroup.getNode(id),
                    });
                }),
            );
            return {
                status: "success",
                description: "Automations fetched successfully",
                data,
                pagination: {
                    hasNext: false,
                    fetchNext: undefined,
                },
            };
        },
        async getScheduleCapableDevices(espcdfGroup: ESPCDFGroup): Promise<{
            node: ESPCDFNode;
            device: ESPCDFDevice;
            isMaxScheduleReached: boolean;
        }[]> {
            try {
                const nodes =
                    espcdfGroup.nodeDetails && espcdfGroup.nodeDetails.length > 0
                        ? espcdfGroup.nodeDetails
                        : await buildCdfNodesFromGroup(group, user, identifier);
                const allDevices: {
                    node: ESPCDFNode;
                    device: ESPCDFDevice;
                    isMaxScheduleReached: boolean;
                }[] = [];
                nodes.forEach((node) => {
                    const devices = node.devices ?? [];
                    devices
                        .filter((device) => device.params && device.params.length > 0)
                        .forEach((device) => {
                            const cdfNode = node;
                            const cdfDevice = device;

                            allDevices.push({
                                node: cdfNode,
                                device: cdfDevice,
                                isMaxScheduleReached: false,
                            });
                        });
                });

                return allDevices;
            } catch (error) {
                throw error;
            }
        },
        async setParams(
            payload: Record<string, Record<string, unknown>>,
        ): Promise<unknown> {
            const broadcast = parseGroupParamBroadcastEnvelope(payload);
            if (!broadcast) {
                return group.setParams(payload);
            }
            // Accumulate one param entry per device type (RMNG cloud payload key).
            const paramsByDeviceType: Record<string, Record<string, unknown>> = {};
            for (const targetRow of broadcast.targets) {
                const deviceType = targetRow.device.type;
                if (!deviceType) continue;
                const paramTypeKey = resolveGroupParamBroadcastTypeKey(targetRow.param);
                if (!paramsByDeviceType[deviceType]) {
                    paramsByDeviceType[deviceType] = {};
                }
                paramsByDeviceType[deviceType][paramTypeKey] = broadcast.value;
            }
            // Build the RMNG cloud wire payload: { [deviceType]: { params: { [paramType]: value } } }.
            const rmngGroupPayload: Record<string, Record<string, unknown>> = {};
            for (const [deviceType, paramEntries] of Object.entries(paramsByDeviceType)) {
                if (Object.keys(paramEntries).length === 0) continue;
                rmngGroupPayload[deviceType] = {
                    [GROUP_CONTROL_PAYLOAD_PARAMS_ENVELOPE_KEY]: paramEntries,
                };
            }
            if (Object.keys(rmngGroupPayload).length === 0) {
                return Promise.resolve();
            }
            return group.setParams(rmngGroupPayload);
        },
    };

    const rawGroup = group as { nodeIds?: string[]; node_ids?: string[] };
    const groupNodeIds = rawGroup.nodeIds ?? rawGroup.node_ids ?? [];

    const cdfGroup = new ESPCDFGroup({
        identifier: identifier,
        id: isSubgroup(group) ? (group.subgroupId ?? group.groupId) : group.groupId,
        name: isSubgroup(group) ? (group.subgroupName ?? group.groupName ?? "") : group.groupName || "",
        nodeIds: groupNodeIds,
        nodeDetails: [],
        parentId: isSubgroup(group) ? group.parentId : undefined,
        mutuallyExclusive: true, // Hardcoded as mutually exclusive by default (homes)
        type: isSubgroup(group) ? "room" : "home", // Hardcoded as home by default (homes)
        isPrimaryUser: accessType === GROUP_USER_ACCESS_PRIMARY,
        accessType,
        subGroups: isSubgroup(group)
            ? []
            : group.subgroups?.map((subgroup: ESPRMNGGroup) =>
                  transformToESPCDFGroup(subgroup, user, identifier, accessType),
              ) || [],
        operations: operations,
        _raw: group,
    });

    return cdfGroup;
}


const isSubgroup = (
    group: ESPRMNGGroup,
): group is ESPRMNGGroup & { parentId: string; subgroupId?: string; subgroupName?: string } => {
    return group.parentId != null && group.parentId !== "";
};


/**
 * Walks this group’s subtree (nested subgroups): getNodes(true) per group, dedupes by node id.
 * Dedupe uses a string record so we never rely on `Set.prototype.has` (was failing at runtime on device).
 */
async function gatherUniqueNodesFromGroupSubtree(
    group: ESPRMNGGroup,
    seenNodeIds: Record<string, true>,
    out: ESPRMNGNode[],
): Promise<void> {
    const nodes = await group.getNodes();
    for (const node of nodes) {
        const nodeId = node.nodeId ?? (node as any).config?.node_id ?? "";
        if (nodeId && !seenNodeIds[nodeId]) {
            seenNodeIds[nodeId] = true;
            out.push(node);
        }
    }
    const subgroups = group.subgroups;
    if (!Array.isArray(subgroups) || subgroups.length === 0) return;
    for (const sub of subgroups) {
        await gatherUniqueNodesFromGroupSubtree(sub, seenNodeIds, out);
    }
}

/**
 * Builds {@link ESPCDFNode}s for this group: walks the group subtree (see gatherUniqueNodesFromGroupSubtree),
 * then maps each RMNG node with transformToESPCDFNodes.
 */
async function buildCdfNodesFromGroup(
    group: ESPRMNGGroup,
    _user: ESPRMNGUser,
    _identifier: string,
): Promise<ESPCDFNode[]> {
    const seenNodeIds: Record<string, true> = {};
    const nodes: ESPRMNGNode[] = [];
    await gatherUniqueNodesFromGroupSubtree(group, seenNodeIds, nodes);
    return transformToESPCDFNodes(nodes, "group.buildCdfNodesFromGroup");
}

async function resolveAutomationTriggerDetails(
    rmngGroup: ESPRMNGGroup,
    automation: { conditions?: { and?: string[] } },
): Promise<ResolvedAutomationEvents> {
    const andIds = automation.conditions?.and ?? [];
    if (andIds.length === 0) return [];

    const getNodeFn = (rmngGroup as { getNode?(id: string): Promise<unknown> }).getNode;
    if (typeof getNodeFn !== "function") return [];

    const resolved: ResolvedAutomationEvents = [];
    const nodeTriggersCache: Record<string, { id?: string; path?: string; operator?: string; value?: unknown }[]> = {};

    for (const triggerId of andIds) {
        if (typeof triggerId !== "string") continue;
        const parts = triggerId.split("~");
        const nid = parts.length >= 1 ? parts[0] : "";
        if (!nid) continue;
        try {
            if (!nodeTriggersCache[nid]) {
                const node = await getNodeFn.call(rmngGroup, nid) as TriggerNodeLike;
                const getTriggersFn = node?.getTriggers;
                if (typeof getTriggersFn !== "function") {
                    nodeTriggersCache[nid] = [];
                    continue;
                }
                const list = await getTriggersFn.call(node);
                nodeTriggersCache[nid] = Array.isArray(list) ? (list as { id?: string; path?: string; operator?: string; value?: unknown }[]) : [];
            }
            const t = nodeTriggersCache[nid].find((tr) => tr.id === triggerId);
            if (t) {
                resolved.push(triggerItemToCdfEvent({
                    id: t.id ?? "",
                    path: t.path ?? "",
                    operator: apiOperatorToTriggerOperator(t.operator),
                    value: t.value,
                }));
            }
        } catch {
            // Non-fatal: skip this trigger
        }
    }
    return resolved;
}
 