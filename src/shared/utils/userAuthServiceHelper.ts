/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import StorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import { getRMSDKConfig } from "@config/sdk.config";
import {
  ESPRM_BASE_URL_PARAM_TYPE,
  ESPRM_REFRESH_TOKEN_STORAGE_KEY,
  ESPRM_RMAKER_USER_AUTH_SERVICE,
  ESPRM_USER_TOKEN_PARAM_TYPE,
  RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_REFRESH_TOKEN,
  RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_SERVICE,
  RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_TOKEN_PARAM,
  RMAKER_USER_AUTH_UPDATE_RESULT_UPDATED,
  WRITE_PERMISSION,
} from "@shared/utils/constants";
import { ESPCDFNode, ESPCDFService, ESPCDFServiceParam } from "@store";

/** Outcome of {@link updateRmakerUserAuthForNode}. */
export type RmakerUserAuthUpdateResult =
  | typeof RMAKER_USER_AUTH_UPDATE_RESULT_UPDATED
  | typeof RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_SERVICE
  | typeof RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_TOKEN_PARAM
  | typeof RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_REFRESH_TOKEN;

/** Resolved `esp.service.rmaker-user-auth` service and writable params on a node. */
export interface RmakerUserAuthConfig {
  userAuthService: ESPCDFService | undefined;
  userTokenParam: ESPCDFServiceParam | undefined;
  baseUrlParam: ESPCDFServiceParam | undefined;
  canUpdate: boolean;
}

/**
 * Whether a service param is readable and writable for RainMaker user-auth updates.
 * @param param - Service param from node config
 * @returns True when read + write are both advertised
 */
const isWritableServiceParam = (param: ESPCDFServiceParam): boolean =>
  (param.properties?.includes(WRITE_PERMISSION) ?? false);

/**
 * Resolves `esp.service.rmaker-user-auth` and its updatable params on a node.
 * Mirrors {@link getNodeSystemConfig} for the user-auth service type.
 * @param node - CDF node to inspect
 * @returns Service handles and whether a token update can be performed
 */
export const getNodeRmakerUserAuthConfig = (
  node: ESPCDFNode | undefined,
): RmakerUserAuthConfig => {
  if (!node?.services?.length) {
    return {
      userAuthService: undefined,
      userTokenParam: undefined,
      baseUrlParam: undefined,
      canUpdate: false,
    };
  }

  const userAuthService = node.services.find(
    (service) => service.type === ESPRM_RMAKER_USER_AUTH_SERVICE,
  );

  if (!userAuthService) {
    return {
      userAuthService: undefined,
      userTokenParam: undefined,
      baseUrlParam: undefined,
      canUpdate: false,
    };
  }

  const userTokenParam = userAuthService.params?.find(
    (param) => param.type === ESPRM_USER_TOKEN_PARAM_TYPE,
  );
  const baseUrlParam = userAuthService.params?.find(
    (param) => param.type === ESPRM_BASE_URL_PARAM_TYPE,
  );

  const canUpdate = Boolean(
    userTokenParam && isWritableServiceParam(userTokenParam),
  );

  return {
    userAuthService,
    userTokenParam,
    baseUrlParam,
    canUpdate,
  };
};

/**
 * Pushes the signed-in user's refresh token (and optional base URL) to
 * `esp.service.rmaker-user-auth` on the node — same flow used after provisioning.
 * @param node - Target CDF node
 * @returns Outcome so callers can distinguish skip vs success vs missing token
 */
export const updateRmakerUserAuthForNode = async (
  node: ESPCDFNode,
): Promise<RmakerUserAuthUpdateResult> => {
  const { userAuthService, userTokenParam, baseUrlParam, canUpdate } =
    getNodeRmakerUserAuthConfig(node);

  if (!userAuthService) {
    return RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_SERVICE;
  }

  if (!canUpdate || !userTokenParam) {
    return RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_TOKEN_PARAM;
  }

  const refreshToken = await StorageAdapter.getItem(
    ESPRM_REFRESH_TOKEN_STORAGE_KEY,
  );

  if (!refreshToken) {
    return RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_REFRESH_TOKEN;
  }

  const paramsToSet: Record<string, string> = {
    [userTokenParam.name]: refreshToken,
  };

  if (baseUrlParam && isWritableServiceParam(baseUrlParam)) {
    paramsToSet[baseUrlParam.name] = getRMSDKConfig().baseUrl;
  }

  await node.setMultipleParams({
    [userAuthService.name]: [paramsToSet],
  });

  return RMAKER_USER_AUTH_UPDATE_RESULT_UPDATED;
};
