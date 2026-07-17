/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import StorageAdapter from '@native-adaptors/implementations/ESPAsyncStorage';
import { DEVICE_TYPE_LIST } from '@/config/devices.config';
import {
  ESPRM_AGENT_AUTH_SERVICE,
  ESPRM_REFRESH_TOKEN_PARAM_TYPE,
  ESPRM_RMAKER_USER_AUTH_SERVICE,
  ESPRM_USER_TOKEN_PARAM_TYPE,
  ESPRM_BASE_URL_PARAM_TYPE,
} from '@shared/utils/constants';
import { TOKEN_STORAGE_KEYS, AI_ASSISTANT_TYPES } from './constants';
import { getRMSDKConfig } from "@config/sdk.config";
import type { AIDeviceData } from '@src/types/global';
import { ESPCDFDevice, ESPCDFDeviceParam, ESPCDFNode, ESPCDFServiceParam } from '@store';


/**
 * Checks whether ai assistant device matches the expected condition.
 */
export function isAIAssistantDevice(device: ESPCDFDevice): boolean {
  const deviceType = device.type?.toLowerCase() || '';

  const matchesAIType = AI_ASSISTANT_TYPES.some(
    (type) => type.toLowerCase() === deviceType
  );

  const deviceConfig = DEVICE_TYPE_LIST.find((config) =>
    config.type.some((t) => t.toLowerCase() === deviceType)
  );

  const matchesConfig =
    deviceConfig?.name === 'Espressif AI Agent' ||
    deviceConfig?.groupLabel === 'AI Assistant';

  return matchesAIType || matchesConfig;
}

/**
 * Handles filter ai assistant devices logic for this module.
 */
export function filterAIAssistantDevices(
  nodeList: ESPCDFNode[] | undefined
): AIDeviceData[] {
  if (!nodeList) {
    return [];
  }

  const devices: AIDeviceData[] = [];

  nodeList.forEach((node) => {
    if (!node.devices) {
      return;
    }

    node.devices?.forEach((device) => {
      if (isAIAssistantDevice(device)) {
        const agentIdParam =
          device.params?.find((param: ESPCDFDeviceParam) => param.name === 'Agent ID') || null;

        devices.push({
          node,
          device,
          agentIdParam,
          isUpdating: false,
        });
      }
    });
  });

  return devices;
}

/**
 * Retrieves device key for downstream consumers.
 */
export function getDeviceKey(nodeId: string, deviceName: string): string {
  return `${nodeId}-${deviceName}`;
}

/**
 * Handles find agent id param logic for this module.
 */
export function findAgentIdParam(
  device: ESPCDFDevice
): ESPCDFDeviceParam | null {
  return device?.params?.find((param) => param.name === 'Agent ID') || null;
}

/**
 * Retrieves current agent id for downstream consumers.
 */
export function getCurrentAgentId(device: ESPCDFDevice): string | undefined {
  const agentIdParam = findAgentIdParam(device);
  return agentIdParam?.value ? String(agentIdParam.value) : undefined;
}

/**
 * Sets user authentication (refresh token and base URL) for a node if it has the rmaker-user-auth service
 * This is done in the background and doesn't block the flow
 */
export async function setUserAuthForNode(node: ESPCDFNode): Promise<void> {
    // Find the rmaker-user-auth service
    const userAuthService = node?.services?.find(
      (service) => service.type === ESPRM_RMAKER_USER_AUTH_SERVICE
    );

    if (!userAuthService) {
      // Device doesn't have user auth service, skip
      return;
    }

    // Find the user-token parameter (required)
    const userTokenParam: ESPCDFServiceParam | undefined =
      userAuthService.params?.find(
        (param) => param.type === ESPRM_USER_TOKEN_PARAM_TYPE
      );

    // Find the base-url parameter (optional)
    const baseUrlParam: ESPCDFServiceParam | undefined =
      userAuthService.params?.find(
        (param) => param.type === ESPRM_BASE_URL_PARAM_TYPE
      );

    // User token parameter is required
    if (!userTokenParam) {
      return;
    }

    // Get refresh token from ESPAsyncStorage
    const refreshToken = await StorageAdapter.getItem(
      TOKEN_STORAGE_KEYS.REFRESH_TOKEN
    );

    if (!refreshToken) {
      return;
    }

    // Build parameters object - always include user-token, conditionally include base-url
    const paramsToSet: Record<string, string> = {
      [userTokenParam.name]: refreshToken,
    };

    // Only add base-url if the parameter exists in the service
    if (baseUrlParam) {
      const baseUrl = getRMSDKConfig().baseUrl;
      paramsToSet[baseUrlParam.name] = baseUrl;
    }

    // Update parameters
    await node?.setMultipleParams({
      [userAuthService.name]: [paramsToSet],
    });
}

/**
 * Handles update refresh tokens for all ai devices logic for this module.
 */
export async function updateRefreshTokensForAllAIDevices(
  nodeList: ESPCDFNode[]
): Promise<void> {
  try {
    if (!nodeList || nodeList.length === 0) {
      return;
    }

    const refreshToken = await StorageAdapter.getItem(
      TOKEN_STORAGE_KEYS.REFRESH_TOKEN
    );

    if (!refreshToken) {
      return;
    }

    for (const node of nodeList) {
      try {
        // Check if node has agent-auth service
        const agentAuthService = node?.services?.find(
          (service) => service.type === ESPRM_AGENT_AUTH_SERVICE
        );

        // If node has agent-auth service, set refresh token for agent-auth
        if (agentAuthService) {
          const refreshTokenParam = agentAuthService.params?.find(
            (param) => param.type === ESPRM_REFRESH_TOKEN_PARAM_TYPE
          );

          if (refreshTokenParam) {
            await refreshTokenParam.setValue(refreshToken);
          }
        }

        // Set user auth (refresh token and base URL) for rmaker-user-auth service
        // This is called for all nodes, but setUserAuthForNode checks if the service exists
        await setUserAuthForNode(node);
      } catch {
        // Silent error handling - continue processing other nodes
      }
    }
  } catch {
    // Silent error handling - don't block login flow
  }
}

