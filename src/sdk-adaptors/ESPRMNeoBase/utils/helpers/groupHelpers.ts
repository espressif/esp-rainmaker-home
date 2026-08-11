/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  clearNcfgVersionMarker,
  ESPRMNeoBase,
  ESPRMNeoGroup,
  ESPRMNeoNode,
  ESPRMNeoSchedule,
  type ESPRMNeoSharingRequest,
  type ESPRMNeoUser,
} from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPCDF,
  type ESPCDFAPIResponse,
  type ESPCDFGroup,
  type ESPCDFGroupSharingInfoInterface,
  type ESPCDFGroupSharingUserInfoInterface,
  type ESPCDFNode,
} from "@store";
import {
  ESPRMNEO_GROUP_SHARING_SCOPE_PARENT,
  ESPRMNEO_GROUP_SHARING_SCOPE_SUBGROUP_ROOM,
  ESPRMNEO_GROUP_USER_ACCESS_PRIMARY,
  ESPRMNEO_GROUP_USER_ACCESS_SECONDARY,
  ESPRMNEO_GROUP_USER_ACCESS_SUBGROUP,
  ESPRMNEO_SDK_SHARING_INFO_ROOT_ONLY_ERROR_FRAGMENT,
  ESPRMNEO_SHARING_DESC_REQUEST_PROCESSED,
  ESPRMNEO_GROUP_ERR_SUBGROUP_MISSING_PARENT_ID,
} from "../constants";
import { applyRefreshedCdfNodeToStore, clearCdfProjectedNcfg } from "./nodeHelpers";
import {
  transformToESPCDFNode,
  transformToESPCDFNodes,
} from "../../transformers/transformToESPCDFNode";
import { transformToESPCDFGroup } from "../../transformers/transformToESPCDFGroup";
import { ESPRMNeoBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import {
  normalizeRmneoSdkResponseToCdf,
  type RmneoSdkApiBody,
} from "./sharedHelpers";
import { GROUP_CONTROL_PAYLOAD_PARAMS_ENVELOPE_KEY } from "@shared/utils/constants";
import {
  resolveGroupParamBroadcastTypeKey,
  type GroupParamBroadcastEnvelope,
} from "@shared/utils/groupParamBroadcastEnvelope";

/** Nested RMNeo group with a non-empty parent id (room / child group). */
export type RmneoChildGroup = ESPRMNeoGroup & {
  parentId: string;
  subgroupId?: string;
  subgroupName?: string;
};

/**
 * Maps RMNeo SDK groups to CDF groups for group-store synchronization.
 * @param esprmngUser - Authenticated RMNeo SDK user required by the transformer.
 * @param groups - RMNeo SDK groups to transform.
 * @returns CDF groups ready for the group store.
 */
export function transformRmneoSdkGroupsToCdf(
  esprmngUser: ESPRMNeoUser,
  groups: ESPRMNeoGroup[],
): ESPCDFGroup[] {
  return groups.map((group) =>
    transformToESPCDFGroup(group, esprmngUser, ESPRMNeoBaseAdaptorIdentifier),
  );
}

/**
 * True when this instance is a nested group (child of another group).
 * Local stand-in for SDK `isChildGroup` (exists in Neo types but not package barrel).
 * @param group - RMNeo group instance
 * @returns Whether `parentId` is set
 */
export function isChildGroup(
  group: ESPRMNeoGroup,
): group is RmneoChildGroup {
  return group.parentId != null && group.parentId !== "";
}

/**
 * True for the error rainmaker-neo-base-sdk <= 1.5.0 throws when `getSharingInfo` is
 * called on a child group ("only supported for root groups").
 * @param error - Unknown catch value from `getSharingInfo`
 * @returns Whether the message matches the root-only SDK fragment
 */
export function isRmneoRootOnlySharingInfoError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(ESPRMNEO_SDK_SHARING_INFO_ROOT_ONLY_ERROR_FRAGMENT)
  );
}

/**
 * Maps RMNeo SDK `accessType` (and optional parent inheritance) to CDF
 * `ESPCDFGroup.accessType`.
 * @param group - RMNeo group instance from the user’s group list
 * @param inheritedUserAccess - When the SDK omits `accessType` on a nested
 *   subgroup, reuse the parent home’s resolved access
 * @returns One of primary / secondary / subgroup access strings
 */
export function resolveRmneoGroupUserAccessTypeForCdf(
  group: ESPRMNeoGroup,
  inheritedUserAccess?: string,
): string {
  const fromSdk = group.accessType ?? inheritedUserAccess;
  if (
    fromSdk === ESPRMNEO_GROUP_USER_ACCESS_PRIMARY ||
    fromSdk === ESPRMNEO_GROUP_USER_ACCESS_SECONDARY ||
    fromSdk === ESPRMNEO_GROUP_USER_ACCESS_SUBGROUP
  ) {
    return fromSdk;
  }
  return ESPRMNEO_GROUP_USER_ACCESS_PRIMARY;
}

/**
 * Maps RMNeo accept/decline success bodies to the CDF API response contract.
 * HTTP status denotes failure; a resolved promise is treated as success.
 * @param res - SDK `SuccessResponse` (`message` optional).
 * @returns CDF API response for the app layer.
 */
export function normalizeRmneoProcessSharingResponse(
  res: unknown,
): ESPCDFAPIResponse {
  const body =
    res && typeof res === "object" ? (res as RmneoSdkApiBody) : undefined;
  return normalizeRmneoSdkResponseToCdf(
    body,
    ESPRMNEO_SHARING_DESC_REQUEST_PROCESSED,
  );
}

/**
 * Resolves the sharer's display username from the RMNeo request.
 * Prefers phone number over email when both are present.
 * @param rmRequest - Raw RMNeo sharing request.
 * @returns Primary username, or empty string when neither contact is set.
 */
export function getPrimaryUsernameFromSharingRequest(
  rmRequest: ESPRMNeoSharingRequest,
): string {
  return rmRequest.primaryPhoneNumber || rmRequest.primaryEmail || "";
}

/**
 * Builds CDF sharing info for a nested subgroup (room) via
 * `GET /v1/groups/{groupId}/subgroups/{subgroupId}/users` (rainmaker-neo-base-sdk routes
 * {@link ESPRMNeoGroup.prototype.getSharingInfo} there for child groups). The
 * backend scopes the listing to the caller’s access: primary callers see the
 * full membership, secondary/subgroup-only callers see the primary owners.
 *
 * Fallback: rainmaker-neo-base-sdk <= 1.5.0 rejects `getSharingInfo` on child groups;
 * in that case we list the parent group’s users and derive primary vs
 * room-scoped secondary members, as before.
 * @param group - Nested RMNeo group (room) with `parentId` set
 * @param cdfGroup - CDF group instance whose `_raw.sharingInfo` is updated for remove-member UX
 * @returns Sharing info payload aligned with {@link ESPCDFGroupSharingInfoInterface}
 */
export async function buildRmneoSubgroupSharingInfo(
  group: ESPRMNeoGroup,
  cdfGroup: ESPCDFGroup,
): Promise<ESPCDFGroupSharingInfoInterface> {
  if (!group.parentId?.trim()) {
    throw new Error(ESPRMNEO_GROUP_ERR_SUBGROUP_MISSING_PARENT_ID);
  }
  const scopedSubgroupId = group.groupId;

  let allUsers;
  try {
    const listResponse = await group.getSharingInfo();
    allUsers = listResponse?.users ?? [];
  } catch (error) {
    if (!isRmneoRootOnlySharingInfoError(error)) {
      throw error;
    }
    const parentGroup = new ESPRMNeoGroup({
      groupId: group.parentId,
      groupName: group.groupName ?? "",
      nodeIds: [],
    });
    const listResponse = await parentGroup.getSharingInfo();
    allUsers = listResponse?.users ?? [];
  }
  cdfGroup._raw.sharingInfo = allUsers;

  return buildCdfGroupSharingInfoFromRmneoUsers({
    groupId: scopedSubgroupId,
    users: allUsers,
    scope: ESPRMNEO_GROUP_SHARING_SCOPE_SUBGROUP_ROOM,
    scopedSubgroupId,
  });
}

/**
 * Resolves the SDK home (`_raw`) for `parentId` from the CDF group store.
 * Used so room/CG `getNodes` can call `home.getNode` (full subgroup set) instead
 * of `child.getNode` (single-subgroup shadow that clobbers MQTT registration).
 */
function findSdkHomeGroupById(parentId: string | undefined): ESPRMNeoGroup | undefined {
  if (!parentId) {
    return undefined;
  }
  const homes = ESPCDF.instance?.groupStore?.groupsList ?? [];
  for (const home of homes) {
    if (home.id === parentId && home._raw) {
      return home._raw as ESPRMNeoGroup;
    }
  }
  return undefined;
}

/**
 * Loads one node via `root.getNode` so `subgroupIds` include every room/CG the
 * node belongs to under that home (shadow `params-{home}-{sortedSubgroups}`).
 */
async function pushNodeFromRootGetNode(
  root: ESPRMNeoGroup,
  nodeId: string,
  seenNodeIds: Record<string, true>,
  out: ESPRMNeoNode[],
): Promise<void> {
  if (!nodeId || seenNodeIds[nodeId]) {
    return;
  }
  try {
    const node = await root.getNode(nodeId);
    seenNodeIds[nodeId] = true;
    out.push(node);
  } catch (error) {
    console.warn(
      `[gatherUniqueNodesFromGroupSubtree] root.getNode(${nodeId}) failed`,
      error,
    );
  }
}

/**
 * Walks this group’s subtree and collects unique nodes.
 *
 * Always resolves nodes through the **home** `getNode` when possible. Calling
 * `subgroup.getNodes()` constructs an `ESPRMNeoNode` with only that child id;
 * the constructor’s `registerNode` then overwrites the orchestrator binding to
 * a non-existent shadow (e.g. `params-home-r4x` instead of `params-home-6ys-r4x`),
 * so per-node MQTT control stops working while group control still works.
 * @param group - Root or nested RMNeo group to walk
 * @param seenNodeIds - Mutable set of already-collected node ids
 * @param out - Mutable list of unique SDK nodes
 * @param rootGroup - Home group used for `getNode` (full subgroup membership)
 */
export async function gatherUniqueNodesFromGroupSubtree(
  group: ESPRMNeoGroup,
  seenNodeIds: Record<string, true>,
  out: ESPRMNeoNode[],
  rootGroup?: ESPRMNeoGroup,
): Promise<void> {
  const root =
    rootGroup ??
    (!isChildGroup(group) ? group : findSdkHomeGroupById(group.parentId));

  if (root) {
    for (const nodeId of group.nodeIds ?? []) {
      await pushNodeFromRootGetNode(root, nodeId, seenNodeIds, out);
    }
  } else {
    // No home handle available — last resort (may register a single-subgroup shadow).
    const nodes = await group.getNodes();
    for (const node of nodes) {
      const nodeId =
        node.nodeId ??
        (node as { config?: { node_id?: string } }).config?.node_id ??
        "";
      if (nodeId && !seenNodeIds[nodeId]) {
        seenNodeIds[nodeId] = true;
        out.push(node);
      }
    }
  }

  if (isChildGroup(group)) {
    return;
  }
  const subgroups = group.subgroups;
  if (!Array.isArray(subgroups) || subgroups.length === 0) {
    return;
  }
  for (const sub of subgroups) {
    await gatherUniqueNodesFromGroupSubtree(sub, seenNodeIds, out, root ?? group);
  }
}

/**
 * Builds CDF nodes via a home-rooted subtree walk (full MQTT shadow context).
 * @param group - RMNeo group whose subtree nodes should be mapped
 * @returns CDF node list for the group subtree
 */
export async function buildCdfNodesFromGroup(
  group: ESPRMNeoGroup,
): Promise<ESPCDFNode[]> {
  const seenNodeIds: Record<string, true> = {};
  const nodes: ESPRMNeoNode[] = [];
  await gatherUniqueNodesFromGroupSubtree(group, seenNodeIds, nodes);
  return transformToESPCDFNodes(nodes, "group.buildCdfNodesFromGroup");
}

/**
 * Loads schedules for every node listed on a home group or its room subgroups.
 * Prefer per-node `getSchedules` over `group.getSchedules()` so room-only
 * members are included (SDK group aggregate uses `nodeIds` only). Failures for
 * individual nodes are skipped so one bad node cannot blank the list.
 * @param homeGroup - Root (home) ESPRMNeoGroup
 * @returns Flat list of ESPRMNeoSchedule from all reachable member nodes
 */
export async function fetchRmneoSchedulesForHomeGroup(
  homeGroup: ESPRMNeoGroup,
): Promise<ESPRMNeoSchedule[]> {
  const nodeIds = readSdkGroupMemberNodeIds(homeGroup);
  if (nodeIds.length === 0) {
    return [];
  }
  const perNode = await Promise.all(
    nodeIds.map(async (nodeId) => {
      try {
        const node = await homeGroup.getNode(nodeId);
        return await node.getSchedules();
      } catch {
        return [] as ESPRMNeoSchedule[];
      }
    }),
  );
  return perNode.flat();
}

/** CDF-local schedule entry after merging the same schedule id across nodes. */
export type RmneoMergedScheduleCdfEntry = {
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
  action: Record<string, Record<string, unknown>>;
  enabled?: boolean;
  validity?: { start?: number; end?: number };
  flags: number;
  devicesCount: number;
};

/**
 * Collapses per-node RMNeo schedules that share an id into one CDF-shaped entry
 * (nodes list + action keyed by nodeId). `info` / `flags` are CDF-local defaults.
 * @param rmneoSchedules - Flat schedule list from {@link fetchRmneoSchedulesForHomeGroup}
 * @returns Merged schedule entries ready for {@link transformToESPCDFSchedule}
 */
export function mergeRmneoSchedulesById(
  rmneoSchedules: ESPRMNeoSchedule[],
): RmneoMergedScheduleCdfEntry[] {
  const schedulesMapById = new Map<string, RmneoMergedScheduleCdfEntry>();

  for (const schedule of rmneoSchedules) {
    const nodeId = schedule.nodeId;
    const scheduleId = schedule.id;
    if (!nodeId || !scheduleId) continue;

    // Neo ScheduleItem.action is required, but guard empty/missing payloads.
    const deviceAction = schedule.action ?? {};
    const devicesCount = Object.keys(deviceAction).length;

    const existing = schedulesMapById.get(scheduleId);
    if (existing) {
      const isNewNode = !existing.nodes.includes(nodeId);
      if (isNewNode) {
        existing.nodes.push(nodeId);
        existing.devicesCount += devicesCount;
      }
      existing.action[nodeId] = {
        ...(existing.action[nodeId] ?? {}),
        ...deviceAction,
      };
    } else {
      schedulesMapById.set(scheduleId, {
        id: scheduleId,
        name: schedule.name ?? "",
        // Neo ScheduleItem has no info/flags — keep CDF defaults.
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

  return Array.from(schedulesMapById.values());
}

/**
 * Bridge child nodes ("<parentId>--<childId>") cannot be removed directly;
 * the cloud sweeps them when their parent bridge node is removed and they
 * don't count toward group emptiness.
 */
const isBridgeChildNodeId = (nodeId: string) => nodeId.includes("--");

const removableNodeIds = (group: ESPRMNeoGroup): string[] =>
  (group.nodeIds ?? []).filter((id) => !isBridgeChildNodeId(id));

const HTTP_STATUS_CONFLICT = 409;

/**
 * The RMNeo cloud rejects deletion of a non-empty group/subgroup with HTTP 409
 * ("group not empty" / "subgroup not empty"). Used to swap the raw cloud
 * message for a localized, actionable one.
 */
export function isGroupNotEmptyError(error: unknown): boolean {
  return (
    (error as { status?: number } | null | undefined)?.status ===
    HTTP_STATUS_CONFLICT
  );
}

/**
 * The RMNeo cloud only deletes empty groups/subgroups and rejects the rest
 * with HTTP 409 ("group not empty" / "subgroup not empty"), so deletion is
 * orchestrated here instead of the app layer:
 * - subgroup: remove its nodes (they stay in the parent group), then delete;
 * - root group: remove all nodes (which also clears their subgroup
 *   membership), delete every subgroup, then delete the group.
 * A 409 can still surface on races (e.g. another user added a node mid-way).
 */
export async function emptyAndDeleteRmneoGroup(
  group: ESPRMNeoGroup
): Promise<RmneoSdkApiBody | undefined> {
  const nodeIds = removableNodeIds(group);
  const clearingRootMembership = !isChildGroup(group);
  if (nodeIds.length > 0) {
    await Promise.all(
      nodeIds.map(async (nodeId) => {
        await group.removeNode(nodeId);
        // Root removeNode fully dissociates the node; subgroup remove keeps
        // membership in the parent home — only clear ncfg markers on root.
        if (clearingRootMembership) {
          await clearNcfgVersionMarker(nodeId).catch(() => {});
          clearCdfProjectedNcfg(nodeId);
        }
      }),
    );
  }
  if (!isChildGroup(group)) {
    for (const subgroup of group.subgroups ?? []) {
      await subgroup.delete();
    }
  }
  return group.delete();
}
/**
 * RMNeo group users list entry as returned by {@link ESPRMNeoGroup.prototype.getSharingInfo}
 * (subset of fields used for CDF sharing UI).
 */
export interface RmneoGroupSharingListUser {
    accessType?: string;
    email?: string;
    phoneNumber?: string;
    userId?: string;
    subgroups?: string[];
}

/**
 * Maps one RMNeo sharing-list user to CDF sharing user info (username matches removal / display fallbacks).
 * @param user - RMNeo list entry from getSharingInfo
 * @returns CDF sharing user row
 */
export function rmneoSharingListUserToCdfEntry(
    user: RmneoGroupSharingListUser,
): ESPCDFGroupSharingUserInfoInterface {
    return {
        username: user.email || user.phoneNumber || user.userId || "",
    };
}

/**
 * Collects primary members from an RMNeo group users list.
 * @param users - RMNeo users array from getSharingInfo
 * @returns CDF primary user rows
 */
export function cdfPrimaryUsersFromRmneoSharingList(
    users: readonly RmneoGroupSharingListUser[],
): ESPCDFGroupSharingUserInfoInterface[] {
    return users
        .filter((u) => u.accessType === ESPRMNEO_GROUP_USER_ACCESS_PRIMARY)
        .map(rmneoSharingListUserToCdfEntry);
}

/**
 * Collects secondary members for a top-level (parent) group: `access_type` secondary.
 * @param users - RMNeo users array from getSharingInfo
 * @returns CDF secondary user rows
 */
export function cdfSecondaryUsersFromRmneoParentGroupList(
    users: readonly RmneoGroupSharingListUser[],
): ESPCDFGroupSharingUserInfoInterface[] {
    return users
        .filter((u) => u.accessType === ESPRMNEO_GROUP_USER_ACCESS_SECONDARY)
        .map(rmneoSharingListUserToCdfEntry);
}

/**
 * Collects room-scoped secondary members: subgroup access and membership under the given subgroup id.
 * @param users - RMNeo users array from the parent group's getSharingInfo
 * @param scopedSubgroupId - Child group (room) id to match in `subgroups`
 * @returns CDF secondary user rows for that room
 */
export function cdfSecondaryUsersFromRmneoSubgroupScopedList(
    users: readonly RmneoGroupSharingListUser[],
    scopedSubgroupId: string,
): ESPCDFGroupSharingUserInfoInterface[] {
    return users
        .filter(
            (u) =>
                u.accessType === ESPRMNEO_GROUP_USER_ACCESS_SUBGROUP &&
                Boolean(u.subgroups?.includes(scopedSubgroupId)),
        )
        .map(rmneoSharingListUserToCdfEntry);
}

type BaseBuildCdfSharingInfoParams = {
    groupId: string;
    mutuallyExclusive?: boolean;
    users: readonly RmneoGroupSharingListUser[];
};

type BuildCdfSharingInfoParams =
    | (BaseBuildCdfSharingInfoParams & {
        scope: typeof ESPRMNEO_GROUP_SHARING_SCOPE_PARENT;
    })
    | (BaseBuildCdfSharingInfoParams & {
        scope: typeof ESPRMNEO_GROUP_SHARING_SCOPE_SUBGROUP_ROOM;
        scopedSubgroupId: string;
    });

/**
 * Builds {@link ESPCDFGroupSharingInfoInterface} from RMNeo getSharingInfo users: primary list is always
 * primary access; secondary list depends on parent vs nested subgroup semantics.
 * @param params - Group id, raw users, and scope: {@link ESPRMNEO_GROUP_SHARING_SCOPE_PARENT} for a home
 *   or {@link ESPRMNEO_GROUP_SHARING_SCOPE_SUBGROUP_ROOM} when deriving a room from the parent user list
 * @returns CDF sharing info payload for adaptor responses
 */
export function buildCdfGroupSharingInfoFromRmneoUsers(
    params: BuildCdfSharingInfoParams,
): ESPCDFGroupSharingInfoInterface {
    const { groupId, users, mutuallyExclusive = true } = params;
    const primaryUsers = cdfPrimaryUsersFromRmneoSharingList(users);
    const secondaryUsers =
        params.scope === ESPRMNEO_GROUP_SHARING_SCOPE_PARENT
            ? cdfSecondaryUsersFromRmneoParentGroupList(users)
            : cdfSecondaryUsersFromRmneoSubgroupScopedList(users, params.scopedSubgroupId);
    return {
        groupId,
        mutuallyExclusive,
        primaryUsers,
        secondaryUsers,
    };
}
/**
 * Drops all channel subscribers and clears the orchestrator's shadow-name
 * binding for each node in one call. `subscriptionManager.unsubscribeFromNode`
 * (no callback arg) now also unregisters the node from the orchestrator, so
 * the next `subscribeToNodeUpdates` re-registers with a fresh shadow name
 * instead of reusing a stale pre-change one. Best-effort: never throws so a
 * resync hiccup can't fail the caller.
 */
export async function resetMqttNodeRegistrations(nodeIds: string[]): Promise<void> {
    const ids = [...new Set(nodeIds)].filter(Boolean);
    if (ids.length === 0) {
        return;
    }

    console.log(`[subgroupMembershipResync] Resyncing MQTT shadow registration for ${ids.length} node(s):`, ids);

    try {
        await Promise.allSettled(
            ids.map((nodeId) => ESPRMNeoBase.subscriptionManager.unsubscribeFromNode(nodeId)),
        );
    } catch (error) {
        console.warn("[subgroupMembershipResync] MQTT unsubscribe failed", error);
    }
}

type CoalescedResyncBatch = {
    user: ESPRMNeoUser;
    ids: Set<string>;
    waiters: (() => void)[];
};

let coalescedBatch: CoalescedResyncBatch | null = null;
let coalescedFlush: Promise<void> | null = null;

/**
 * Full MQTT resync after any subgroup membership change (CG/room create,
 * edit add/remove, delete, leave, share-accept sync, etc.).
 *
 * Concurrent callers in the same turn (e.g. edit firing addNodes + removeNodes)
 * are coalesced into one reset/getNode/bind/subscribe pass over the union of
 * node ids — parallel resyncs previously raced and left DeviceCard stale until
 * pull-to-refresh. Best-effort: never throws.
 */
export async function resyncMqttAfterSubgroupChange(
    esprmngUser: ESPRMNeoUser,
    nodeIdsToRefresh: string[],
): Promise<void> {
    const ids = [...new Set(nodeIdsToRefresh)].filter(Boolean);
    if (ids.length === 0) {
        return;
    }

    if (!coalescedBatch) {
        coalescedBatch = { user: esprmngUser, ids: new Set(), waiters: [] };
    } else {
        coalescedBatch.user = esprmngUser;
    }
    for (const id of ids) {
        coalescedBatch.ids.add(id);
    }

    await new Promise<void>((resolve) => {
        coalescedBatch!.waiters.push(resolve);
        if (!coalescedFlush) {
            coalescedFlush = flushCoalescedResync().finally(() => {
                coalescedFlush = null;
            });
        }
    });
}

async function flushCoalescedResync(): Promise<void> {
    // Yield so Promise.allSettled([addNodes, removeNodes]) callers join one batch.
    await Promise.resolve();
    while (coalescedBatch) {
        const batch = coalescedBatch;
        coalescedBatch = null;
        await runFullMqttResync(batch.user, [...batch.ids]);
        for (const resolve of batch.waiters) {
            resolve();
        }
    }
}

async function runFullMqttResync(
    esprmngUser: ESPRMNeoUser,
    ids: string[],
): Promise<void> {
    if (ids.length === 0) {
        return;
    }

    const cdfUser = ESPCDF.instance?.userStore?.user;
    await cdfUser?.unsubscribeFromNodeUpdates?.().catch(() => {});
    await resetMqttNodeRegistrations(ids);

    let groups: Awaited<ReturnType<ESPRMNeoUser["getGroups"]>> = [];
    try {
        groups = await esprmngUser.getGroups();
    } catch (error) {
        console.warn("[subgroupMembershipResync] getGroups failed during subgroup resync", error);
    }

    for (const home of groups) {
        for (const nodeId of ids) {
            // Nodes often live only on room/CG subgroups, not home.nodeIds.
            if (!sdkGroupContainsNodeId(home, nodeId)) continue;
            try {
                const fresh = await home.getNode(nodeId);
                // Rebuild CDF devices/params so DeviceCard setValue WeakRefs
                // point at this fresh SDK node (MQTT transport lives there).
                // Swapping only `_raw` left control on the pre-resync node with
                // empty availableTransports → NODE_UNREACHABLE.
                applyRefreshedCdfNodeToStore(transformToESPCDFNode(fresh));
            } catch (error) {
                console.warn(
                    `[subgroupMembershipResync] getNode(${nodeId}) failed during subgroup resync`,
                    error,
                );
            }
        }
    }

    try {
        const nodesList = ESPCDF.instance?.nodeStore?.nodesList;
        if (cdfUser && nodesList?.length) {
            await cdfUser.subscribeToNodeUpdates({ nodeList: nodesList });
        }
    } catch (error) {
        console.warn(
            "[subgroupMembershipResync] subscribeToNodeUpdates failed during subgroup resync",
            error,
        );
    }
}

/** nodeId -> set of subgroup ids it currently belongs to, across all given homes. */
export function buildNodeSubgroupMembershipMap(homes: ESPCDFGroup[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const home of homes) {
        for (const subgroup of home.subGroups ?? []) {
            for (const nodeId of subgroup.nodeIds ?? []) {
                let ids = map.get(nodeId);
                if (!ids) {
                    ids = new Set();
                    map.set(nodeId, ids);
                }
                ids.add(subgroup.id);
            }
        }
    }
    return map;
}

function subgroupSetsEqual(a: Set<string> | undefined, b: Set<string> | undefined): boolean {
    const aSize = a?.size ?? 0;
    const bSize = b?.size ?? 0;
    if (aSize !== bSize) {
        return false;
    }
    if (aSize === 0) {
        return true;
    }
    for (const id of a!) {
        if (!b!.has(id)) {
            return false;
        }
    }
    return true;
}

/**
 * Node IDs whose subgroup membership differs between two
 * {@link buildNodeSubgroupMembershipMap} snapshots - i.e. nodes whose MQTT
 * shadow topic may now be stale and need {@link resetMqttNodeRegistrations}.
 */
export function diffChangedSubgroupMembershipNodeIds(
    before: Map<string, Set<string>>,
    after: Map<string, Set<string>>,
): string[] {
    const changed: string[] = [];
    const allNodeIds = new Set([...before.keys(), ...after.keys()]);
    for (const nodeId of allNodeIds) {
        if (!subgroupSetsEqual(before.get(nodeId), after.get(nodeId))) {
            changed.push(nodeId);
        }
    }
    return changed;
}

const LOG_GET_GROUPS_SHARED = "[rmneoGetGroupsShared]";

/** Set while a getGroups() network call is running; cleared when it finishes. */
let pendingGetGroups: Promise<ESPRMNeoGroup[]> | null = null;

/**
 * Returns groups from the cloud. If another caller is already fetching groups,
 * this waits for that same result instead of starting a second getGroups().
 *
 * Used by getNodeDetails when the CDF loads several new nodes at once
 * (each node triggers getNodeDetails in parallel).
 * @param esprmngUser - Logged-in RMNeo user used for `getGroups()`.
 * @returns Cloud group list from the in-flight or newly started fetch.
 */
export async function getRmneoGroupsShared(
  esprmngUser: ESPRMNeoUser,
): Promise<ESPRMNeoGroup[]> {
  if (pendingGetGroups) {
    console.log(`${LOG_GET_GROUPS_SHARED} reusing getGroups() already in progress`);
    return pendingGetGroups;
  }
  pendingGetGroups = esprmngUser.getGroups().finally(() => {
    pendingGetGroups = null;
  });
  return pendingGetGroups;
}

/** Node IDs listed on a home group or its room subgroups. */
export function readSdkGroupMemberNodeIds(group: ESPRMNeoGroup): string[] {
  const ids = new Set<string>(group.nodeIds ?? []);
  for (const sub of group.subgroups ?? []) {
    for (const id of sub.nodeIds ?? []) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Whether `nodeId` is listed on the home group or any of its room subgroups.
 * @param group - SDK home group to inspect.
 * @param nodeId - Node id to look up.
 * @returns True when the node is a member of the group tree.
 */
export function sdkGroupContainsNodeId(
  group: ESPRMNeoGroup,
  nodeId: string,
): boolean {
  return readSdkGroupMemberNodeIds(group).includes(nodeId);
}

/**
 * Home group that owns `nodeId` per cloud `node_ids` / room membership.
 * Returns undefined when the node is not listed on any group yet.
 * @param groups - Candidate SDK home groups.
 * @param nodeId - Node id to resolve.
 * @returns Matching home `groupId`, or undefined.
 */
export function resolveSdkGroupIdForNodeId(
  groups: ESPRMNeoGroup[],
  nodeId: string,
): string | undefined {
  for (const group of groups) {
    if (sdkGroupContainsNodeId(group, nodeId)) {
      return group.groupId;
    }
  }
  return undefined;
}

/**
 * Finds the SDK home group that lists `nodeId` in itself or a subgroup.
 * @param groups - Candidate SDK home groups.
 * @param nodeId - Node id to resolve.
 * @returns Matching SDK group, or undefined.
 */
export function resolveSdkGroupForNodeId(
  groups: ESPRMNeoGroup[],
  nodeId: string,
): ESPRMNeoGroup | undefined {
  return groups.find((group) => sdkGroupContainsNodeId(group, nodeId));
}

/**
 * Restrict node config lookup to groups that actually list the node.
 * Avoids `/groups/<wrong>/nodes/<id>/config` 500s when the UI home ≠ cloud membership.
 * @param groups - Candidate SDK home groups.
 * @param nodeId - Node whose membership should prefer matching homes.
 * @param preferredGroupId - Optional UI/current home id to sort first.
 * @returns Ordered groups for node config lookup.
 */
export function orderSdkGroupsForNodeLookup(
  groups: ESPRMNeoGroup[],
  nodeId: string,
  preferredGroupId?: string,
): ESPRMNeoGroup[] {
  const members = groups.filter((group) =>
    sdkGroupContainsNodeId(group, nodeId),
  );
  const ordered =
    members.length > 0
      ? members
      : preferredGroupId
        ? groups.filter((g) => g.groupId === preferredGroupId)
        : groups;
  if (!preferredGroupId || ordered.length <= 1) {
    return ordered;
  }
  return [...ordered].sort((a, b) => {
    if (a.groupId === preferredGroupId) return -1;
    if (b.groupId === preferredGroupId) return 1;
    return 0;
  });
}

/**
 * Expands a CDF group param broadcast envelope into the RMNeo cloud wire shape:
 * `{ [deviceType]: { params: { [paramType]: value } } }`.
 * @param broadcast - Parsed envelope from {@link parseGroupParamBroadcastEnvelope}
 * @returns Wire payload for {@link ESPRMNeoGroup.setParams}, or `null` when empty
 */
export function buildRmneoGroupSetParamsPayloadFromBroadcast(
  broadcast: GroupParamBroadcastEnvelope,
): Record<string, Record<string, unknown>> | null {
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

  const rmneoGroupPayload: Record<string, Record<string, unknown>> = {};
  for (const [deviceType, paramEntries] of Object.entries(paramsByDeviceType)) {
    if (Object.keys(paramEntries).length === 0) continue;
    rmneoGroupPayload[deviceType] = {
      [GROUP_CONTROL_PAYLOAD_PARAMS_ENVELOPE_KEY]: paramEntries,
    };
  }

  if (Object.keys(rmneoGroupPayload).length === 0) {
    return null;
  }
  return rmneoGroupPayload;
}

