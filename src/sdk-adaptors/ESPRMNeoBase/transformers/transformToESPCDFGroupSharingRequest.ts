/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFAPIResponse,
  ESPCDFGroupSharingRequest,
  ESPCDFGroupSharingRequestInterface,
  ESPCDFGroupSharingRequestOperation,
  ESPCDFGroupSharingStatus,
} from "@store";
import type { ESPRMNeoSharingRequest } from "@espressif/rainmaker-neo-base-sdk";
import {
  getPrimaryUsernameFromSharingRequest,
  normalizeRmneoProcessSharingResponse,
} from "../utils/helpers/groupHelpers";
import {
  ESPRMNEO_SHARING_ERR_REMOVE_UNSUPPORTED,
  ESPRMNEO_SHARING_META_ACCESS_TYPE,
  ESPRMNEO_SHARING_META_GROUP_ID,
  ESPRMNEO_SHARING_META_SUBGROUP_ID,
} from "../utils/constants";

/**
 * Maps an RMNeo received sharing request (`listSharingRequests`) to CDF.
 * RMNeo returns a flat list (no pagination / `fetchNext`).
 *
 * When `subgroupId` is set, that id is used as the effective group target
 * (room-scoped share); otherwise `groupId` (home) is used.
 * @param rmRequest - Raw RMNeo sharing request from the SDK.
 * @returns CDF group sharing request with accept / decline / remove operations.
 */
export function transformToESPCDFGroupSharingRequest(
  rmRequest: ESPRMNeoSharingRequest,
): ESPCDFGroupSharingRequest {
  const effectiveGroupId = rmRequest.subgroupId?.trim()
    ? rmRequest.subgroupId
    : rmRequest.groupId;

  const operations: ESPCDFGroupSharingRequestOperation = {
    /**
     * Accepts the incoming share via the RMNeo SDK.
     * @returns CDF API response for the accept call.
     */
    async accept(): Promise<ESPCDFAPIResponse> {
      const result = await rmRequest.accept();
      return normalizeRmneoProcessSharingResponse(result);
    },

    /**
     * Declines the incoming share via the RMNeo SDK.
     * @returns CDF API response for the decline call.
     */
    async decline(): Promise<ESPCDFAPIResponse> {
      const result = await rmRequest.decline();
      return normalizeRmneoProcessSharingResponse(result);
    },

    /**
     * Not supported: `ESPRMNeoSharingRequest` only exposes `accept` /
     * `decline` (POST accept / reject). There is no `remove` / cancel method
     * or DELETE sharing-request endpoint in rainmaker-neo-base-sdk. Kept for CDF
     * operation parity with other adaptors.
     * @returns Never resolves — always rejects.
     * @throws Always throws {@link ESPRMNEO_SHARING_ERR_REMOVE_UNSUPPORTED}.
     */
    async remove(): Promise<ESPCDFAPIResponse> {
      throw new Error(ESPRMNEO_SHARING_ERR_REMOVE_UNSUPPORTED);
    },
  };

  const requestData: ESPCDFGroupSharingRequestInterface = {
    id: rmRequest.sharingRequestId,
    status: ESPCDFGroupSharingStatus.pending,
    timestamp: Math.floor(Date.now() / 1000),
    groupIds: [effectiveGroupId],
    groupnames: [],
    username: "",
    primaryUsername: getPrimaryUsernameFromSharingRequest(rmRequest),
    transfer: false,
    newRole: rmRequest.accessType ?? "",
    metadata: {
      [ESPRMNEO_SHARING_META_ACCESS_TYPE]: rmRequest.accessType,
      [ESPRMNEO_SHARING_META_GROUP_ID]: rmRequest.groupId,
      [ESPRMNEO_SHARING_META_SUBGROUP_ID]: rmRequest.subgroupId,
    },
    operations,
    _raw: rmRequest,
  };

  return new ESPCDFGroupSharingRequest(requestData);
}
