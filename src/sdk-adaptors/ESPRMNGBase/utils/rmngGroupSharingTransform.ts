/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
    ESPCDFGroupSharingInfoInterface,
    ESPCDFGroupSharingUserInfoInterface,
} from "@store";
import {
    ESPRMNG_GROUP_USER_ACCESS_PRIMARY,
    ESPRMNG_GROUP_USER_ACCESS_SECONDARY,
    ESPRMNG_GROUP_USER_ACCESS_SUBGROUP,
    ESPRMNG_GROUP_SHARING_SCOPE_PARENT,
    ESPRMNG_GROUP_SHARING_SCOPE_SUBGROUP_ROOM,
} from "./constants";

/**
 * RMNG group users list entry as returned by {@link ESPRMNGGroup.prototype.getSharingInfo}
 * (subset of fields used for CDF sharing UI).
 */
export interface RmngGroupSharingListUser {
    access_type?: string;
    email?: string;
    phone?: string;
    user_id?: string;
    subgroups?: string[];
}

/**
 * Maps one RMNG sharing-list user to CDF sharing user info (username matches removal / display fallbacks).
 * @param user - RMNG list entry from getSharingInfo
 * @returns CDF sharing user row
 */
export function rmngSharingListUserToCdfEntry(
    user: RmngGroupSharingListUser,
): ESPCDFGroupSharingUserInfoInterface {
    return {
        username: user.email || user.phone || user.user_id || "",
    };
}

/**
 * Collects primary members from an RMNG group users list.
 * @param users - RMNG users array from getSharingInfo
 * @returns CDF primary user rows
 */
export function cdfPrimaryUsersFromRmngSharingList(
    users: readonly RmngGroupSharingListUser[],
): ESPCDFGroupSharingUserInfoInterface[] {
    return users
        .filter((u) => u.access_type === ESPRMNG_GROUP_USER_ACCESS_PRIMARY)
        .map(rmngSharingListUserToCdfEntry);
}

/**
 * Collects secondary members for a top-level (parent) group: `access_type` secondary.
 * @param users - RMNG users array from getSharingInfo
 * @returns CDF secondary user rows
 */
export function cdfSecondaryUsersFromRmngParentGroupList(
    users: readonly RmngGroupSharingListUser[],
): ESPCDFGroupSharingUserInfoInterface[] {
    return users
        .filter((u) => u.access_type === ESPRMNG_GROUP_USER_ACCESS_SECONDARY)
        .map(rmngSharingListUserToCdfEntry);
}

/**
 * Collects room-scoped secondary members: subgroup access and membership under the given subgroup id.
 * @param users - RMNG users array from the parent group's getSharingInfo
 * @param scopedSubgroupId - Child group (room) id to match in `subgroups`
 * @returns CDF secondary user rows for that room
 */
export function cdfSecondaryUsersFromRmngSubgroupScopedList(
    users: readonly RmngGroupSharingListUser[],
    scopedSubgroupId: string,
): ESPCDFGroupSharingUserInfoInterface[] {
    return users
        .filter(
            (u) =>
                u.access_type === ESPRMNG_GROUP_USER_ACCESS_SUBGROUP &&
                Boolean(u.subgroups?.includes(scopedSubgroupId)),
        )
        .map(rmngSharingListUserToCdfEntry);
}

type BaseBuildCdfSharingInfoParams = {
    groupId: string;
    mutuallyExclusive?: boolean;
    users: readonly RmngGroupSharingListUser[];
};

type BuildCdfSharingInfoParams =
    | (BaseBuildCdfSharingInfoParams & {
        scope: typeof ESPRMNG_GROUP_SHARING_SCOPE_PARENT;
    })
    | (BaseBuildCdfSharingInfoParams & {
        scope: typeof ESPRMNG_GROUP_SHARING_SCOPE_SUBGROUP_ROOM;
        scopedSubgroupId: string;
    });

/**
 * Builds {@link ESPCDFGroupSharingInfoInterface} from RMNG getSharingInfo users: primary list is always
 * primary access; secondary list depends on parent vs nested subgroup semantics.
 * @param params - Group id, raw users, and scope: {@link RMNG_CDF_GROUP_SHARING_SCOPE_PARENT} for a home
 *   or {@link RMNG_CDF_GROUP_SHARING_SCOPE_SUBGROUP_ROOM} when deriving a room from the parent user list
 * @returns CDF sharing info payload for adaptor responses
 */
export function buildCdfGroupSharingInfoFromRmngUsers(
    params: BuildCdfSharingInfoParams,
): ESPCDFGroupSharingInfoInterface {
    const { groupId, users, mutuallyExclusive = true } = params;
    const primaryUsers = cdfPrimaryUsersFromRmngSharingList(users);
    const secondaryUsers =
        params.scope === ESPRMNG_GROUP_SHARING_SCOPE_PARENT
            ? cdfSecondaryUsersFromRmngParentGroupList(users)
            : cdfSecondaryUsersFromRmngSubgroupScopedList(users, params.scopedSubgroupId);
    return {
        groupId,
        mutuallyExclusive,
        primaryUsers,
        secondaryUsers,
    };
}
