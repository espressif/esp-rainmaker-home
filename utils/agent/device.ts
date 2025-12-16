/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ESPRMNode, ESPRMDevice, ESPRMDeviceParam, ESPRMServiceParam } from '@espressif/rainmaker-base-sdk';
import { DEVICE_TYPE_LIST } from '@/config/devices.config';
import { 
  ESPRM_AGENT_AUTH_SERVICE, 
  ESPRM_REFRESH_TOKEN_PARAM_TYPE,
  ESPRM_RMAKER_USER_AUTH_SERVICE,
  ESPRM_USER_TOKEN_PARAM_TYPE,
  ESPRM_BASE_URL_PARAM_TYPE,
} from '@/utils/constants';
import { TOKEN_STORAGE_KEYS, AI_ASSISTANT_TYPES } from './constants';
import { SDKConfig } from '@/rainmaker.config';
import type { AIDeviceData } from '@/types/global';

export function isAIAssistantDevice(device: ESPRMDevice): boolean {
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

export function filterAIAssistantDevices(
  nodeList: ESPRMNode[] | undefined
): AIDeviceData[] {
  if (!nodeList) {
    return [];
  }

  const devices: AIDeviceData[] = [];

  nodeList.forEach((node) => {
    if (!node.nodeConfig?.devices) {
      return;
    }

    node.nodeConfig.devices.forEach((device) => {
      if (isAIAssistantDevice(device)) {
        const agentIdParam =
          device.params?.find((param) => param.name === 'Agent ID') || null;

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

export function getDeviceKey(nodeId: string, deviceName: string): string {
  return `${nodeId}-${deviceName}`;
}

export function findAgentIdParam(
  device: ESPRMDevice
): ESPRMDeviceParam | null {
  return device?.params?.find((param) => param.name === 'Agent ID') || null;
}

export function getCurrentAgentId(device: ESPRMDevice): string | undefined {
  const agentIdParam = findAgentIdParam(device);
  return agentIdParam?.value ? String(agentIdParam.value) : undefined;
}

/**
 * Sets user authentication (refresh token and base URL) for a node if it has the rmaker-user-auth service
 * This is done in the background and doesn't block the flow
 */
export async function setUserAuthForNode(node: ESPRMNode): Promise<void> {
  try {
    // Find the rmaker-user-auth service
    const userAuthService = node?.nodeConfig?.services?.find(
      (service) => service.type === ESPRM_RMAKER_USER_AUTH_SERVICE
    );

    if (!userAuthService) {
      // Device doesn't have user auth service, skip
      return;
    }

    // Find the user-token parameter (required)
    const userTokenParam: ESPRMServiceParam | undefined =
      userAuthService.params?.find(
        (param) => param.type === ESPRM_USER_TOKEN_PARAM_TYPE
      );

    // Find the base-url parameter (optional)
    const baseUrlParam: ESPRMServiceParam | undefined =
      userAuthService.params?.find(
        (param) => param.type === ESPRM_BASE_URL_PARAM_TYPE
      );

    // User token parameter is required
    if (!userTokenParam) {
      return;
    }

    // Get refresh token from AsyncStorage
    const refreshToken = await AsyncStorage.getItem(
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
      const baseUrl = SDKConfig.baseUrl || "https://api.rainmaker.espressif.com";
      paramsToSet[baseUrlParam.name] = baseUrl;
    }

    // Update parameters
    await node?.setMultipleParams({
      [userAuthService.name]: [paramsToSet],
    });
  } catch (error) {
    // Silent error handling - don't block the flow
  }
}

export async function updateRefreshTokensForAllAIDevices(
  nodeList: ESPRMNode[]
): Promise<void> {
  try {
    if (!nodeList || nodeList.length === 0) {
      return;
    }

    const refreshToken = await AsyncStorage.getItem(
      TOKEN_STORAGE_KEYS.REFRESH_TOKEN
    );

    if (!refreshToken) {
      return;
    }

    for (const node of nodeList) {
      try {
        // Check if node has agent-auth service
        const agentAuthService = node?.nodeConfig?.services?.find(
          (service) => service.type === ESPRM_AGENT_AUTH_SERVICE
        );

        // If node has agent-auth service, set refresh token for agent-auth
        if (agentAuthService) {
          const refreshTokenParam = agentAuthService.params?.find(
            (param) => param.type === ESPRM_REFRESH_TOKEN_PARAM_TYPE
          );

          if (refreshTokenParam) {
            await node?.setMultipleParams({
              [agentAuthService.name]: [
                {
                  [refreshTokenParam.name]: refreshToken,
                },
              ],
            });
          }
        }

        // Set user auth (refresh token and base URL) for rmaker-user-auth service
        // This is called for all nodes, but setUserAuthForNode checks if the service exists
        await setUserAuthForNode(node);
      } catch (error) {
        // Silent error handling - continue processing other nodes
      }
    }
  } catch (error) {
    // Silent error handling - don't block login flow
  }
}

