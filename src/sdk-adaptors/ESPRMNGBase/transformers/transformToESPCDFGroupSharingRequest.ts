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
import type { ESPRMNGSharingRequest } from "@espressif/rmng-base-sdk";
import { normalizeRmngSdkResponseToCdf, type RmngSdkApiBody } from "../utils/common";

/**
 * Maps RMNG accept/decline success bodies to the CDF API response contract.
 * HTTP status denotes failure; a resolved promise is treated as success.
 *
 * @param res - SDK `SuccessResponse` (`message` optional).
 * @returns CDF API response for the app layer.
 */
function normalizeRmngProcessSharingResponse(res: unknown): ESPCDFAPIResponse {
    const body =
        res && typeof res === "object" ? (res as RmngSdkApiBody) : undefined;
    return normalizeRmngSdkResponseToCdf(
        body,
        "Group sharing request processed successfully",
    );
}

/**
 * Get the primary username from the RMNG sharing request.
 * Prioritize phone number over email if present.
 * @param rmRequest - The RMNG sharing request.
 * @returns The primary username.
 */
function getPrimaryUsername(rmRequest: ESPRMNGSharingRequest): string {
    return rmRequest.primaryPhoneNumber || rmRequest.primaryEmail || "";
}
/**
 * Maps an RMNG received sharing request (`listSharingRequests`) to CDF.
 * RMNG returns a flat list (no pagination / fetchNext).
 */
export function transformToESPCDFGroupSharingRequest(
    rmRequest: ESPRMNGSharingRequest,
): ESPCDFGroupSharingRequest {
    const effectiveGroupId =
        rmRequest.subgroupId?.trim() ? rmRequest.subgroupId : rmRequest.groupId;

    const operations: ESPCDFGroupSharingRequestOperation = {
        async accept(): Promise<ESPCDFAPIResponse> {
            const r = await rmRequest.accept();
            return normalizeRmngProcessSharingResponse(r);
        },
        async decline(): Promise<ESPCDFAPIResponse> {
            const r = await rmRequest.decline();
            return normalizeRmngProcessSharingResponse(r);
        },
        async remove(): Promise<ESPCDFAPIResponse> {
            const r = await rmRequest.decline();
            return normalizeRmngProcessSharingResponse(r);
        },
    };

    const requestData: ESPCDFGroupSharingRequestInterface = {
        id: rmRequest.sharingRequestId,
        status: ESPCDFGroupSharingStatus.pending,
        timestamp: Math.floor(Date.now() / 1000),
        groupIds: [effectiveGroupId],
        groupnames: [],
        username: "",
        primaryUsername: getPrimaryUsername(rmRequest),
        transfer: false,
        newRole: rmRequest.accessType ?? "",
        metadata: {
            accessType: rmRequest.accessType,
            groupId: rmRequest.groupId,
            subgroupId: rmRequest.subgroupId,
        },
        operations,
        _raw: rmRequest,
    };

    return new ESPCDFGroupSharingRequest(requestData);
}
