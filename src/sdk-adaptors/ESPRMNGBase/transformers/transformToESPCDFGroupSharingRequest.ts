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

function normalizeRmngProcessSharingResponse(res: unknown): ESPCDFAPIResponse {
    if (res && typeof res === "object" && "status" in res) {
        const r = res as Record<string, unknown>;
        const st = r.status;
        const stNorm = typeof st === "string" ? st.toLowerCase() : "";
        const isSuccess =
            stNorm === "success" ||
            stNorm.includes("accepted successfully") ||
            stNorm.includes("rejected successfully") ||
            stNorm.includes("successfully");
        if (isSuccess) {
            return {
                status: "success",
                description:
                    (typeof r.description === "string" && r.description) ||
                    (typeof r.message === "string" && r.message) ||
                    (typeof st === "string" ? st : undefined),
            };
        }

        const description =
            (typeof r.description === "string" && r.description) ||
            (typeof r.message === "string" && r.message) ||
            `RMNG group sharing request failed with status: ${String(st)}`;

        const err = new Error(description);
        // Attach extra context for debugging without changing the public API.
        (err as any).status = st;
        (err as any).raw = res;
        throw err;
    }

    throw new Error("RMNG group sharing request returned an unexpected response");
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
