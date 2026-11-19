/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPCDF,
  type ESPCDFAssumeRoleRequest,
  type ESPCDFAssumeRoleResponse,
} from "@store";
import { Logger } from "../logger";
import {
  ESPRMNEO_ASSUME_ROLE_DEFAULT_SERVICES,
  ESPRMNEO_ASSUME_ROLE_SUPPORTED_SERVICES,
  ESPRMNEO_USER_ERR_ASSUME_ROLE_FAILED,
  ESPRMNEO_USER_ERR_ASSUME_ROLE_GROUP_NOT_FOUND,
  ESPRMNEO_USER_ERR_ASSUME_ROLE_NODE_REQUIRED,
  ESPRMNEO_USER_ERR_ASSUME_ROLE_UNSUPPORTED_SERVICE,
  ESPRMNEO_USER_LOG_ASSUME_ROLE_PREFIX,
} from "../constants";
import { throwNormalizedRmneoError } from "./sharedHelpers";

/** Neo per-node assumed-roles only allow these service names. */
type ServiceName = (typeof ESPRMNEO_ASSUME_ROLE_SUPPORTED_SERVICES)[number];

const supportedServices = new Set<string>(ESPRMNEO_ASSUME_ROLE_SUPPORTED_SERVICES);

/**
 * Returns the sole node id from the assume-role request.
 * @param nodeIds - Node ids from the CDF assume-role request.
 * @returns The node id when exactly one is given.
 * @throws {Error} When the list is missing, empty, or has more than one id.
 */
function requireSingleNodeId(nodeIds: string[] | undefined): string {
  const id = nodeIds?.length === 1 ? nodeIds[0] : undefined;
  if (!id) {
    throw new Error(ESPRMNEO_USER_ERR_ASSUME_ROLE_NODE_REQUIRED);
  }
  return id;
}

/**
 * Returns service names from `extraPayload.services` when provided; otherwise the default set.
 * @param request - CDF assume-role request.
 * @returns Validated service names for the SDK call.
 * @throws {Error} When a requested service is not supported.
 */
function readRequestedServices(request: ESPCDFAssumeRoleRequest): ServiceName[] {
  const fromPayload = request.extraPayload?.services;
  const names =
    Array.isArray(fromPayload) && fromPayload.length > 0
      ? fromPayload
      : [...ESPRMNEO_ASSUME_ROLE_DEFAULT_SERVICES];

  for (const name of names) {
    if (!supportedServices.has(String(name))) {
      throw new Error(ESPRMNEO_USER_ERR_ASSUME_ROLE_UNSUPPORTED_SERVICE);
    }
  }
  return names as ServiceName[];
}

/**
 * Returns `groupIds[0]` when set, otherwise the current CDF home id.
 * @param request - CDF assume-role request.
 * @returns Top-level group id for the assume-role route.
 * @throws {Error} When neither is available.
 */
function resolveAssumeRoleGroupId(request: ESPCDFAssumeRoleRequest): string {
  const fromRequest = request.groupIds?.[0];
  if (fromRequest) {
    return fromRequest;
  }
  const homeId = ESPCDF.instance?.getCurrentHome()?.id;
  if (!homeId) {
    throw new Error(ESPRMNEO_USER_ERR_ASSUME_ROLE_GROUP_NOT_FOUND);
  }
  return homeId;
}

/**
 * Returns temporary AWS credentials for the assume-role request.
 * @param esprmneoUser - Authenticated Neo user.
 * @param request - CDF assume-role request.
 * @returns Short-lived access key, secret key, and session token.
 */
export async function getAssumeRoleCreds(
  esprmneoUser: ESPRMNeoUser,
  request: ESPCDFAssumeRoleRequest,
): Promise<ESPCDFAssumeRoleResponse> {
  const nodeId = requireSingleNodeId(request.nodeIds);
  const services = readRequestedServices(request);

  try {
    const groupId = resolveAssumeRoleGroupId(request);

    const sdkCreds = await esprmneoUser.assumeRole("", "", "", {
      services,
      nodeId,
      groupId,
    });

    Logger.info(
      `${ESPRMNEO_USER_LOG_ASSUME_ROLE_PREFIX} issued ${services.join("+")} for node ${nodeId} (group ${groupId})`,
    );
    return {
      accessKey: sdkCreds.access_key,
      secretKey: sdkCreds.secret_key,
      sessionToken: sdkCreds.session_token,
    };
  } catch (error) {
    Logger.warn(
      `${ESPRMNEO_USER_LOG_ASSUME_ROLE_PREFIX} failed for node ${nodeId}`,
      error,
    );
    return throwNormalizedRmneoError(error, ESPRMNEO_USER_ERR_ASSUME_ROLE_FAILED);
  }
}
