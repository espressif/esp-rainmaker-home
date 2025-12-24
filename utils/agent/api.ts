/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ESPRMUser } from '@espressif/rainmaker-base-sdk';
import { CDF } from '@espressif/rainmaker-base-cdf';
import { getAgentConfig as fetchAgentConfig } from '@/utils/apiHelper';
import type { ConnectedConnector } from '@/types/global';
import { AGENTS_WEBSOCKET_BASE_URL, DEFAULT_AGENT_ID, RAINMAKER_MCP_CONNECTOR_URL } from '@/config/agent.config';
import { TOKEN_STORAGE_KEYS } from './constants';
import { getSelectedAgentId } from './storage';
import type { AgentConfigResponse } from './types';
import type { ToolConnectionStatus } from '@/types/global';

// ==================== Agent Config Cache ====================

const AGENT_CONFIGS_MAP_KEY = 'agents_config';

export const getAgentConfigFromCache = async (
  agentId: string
): Promise<AgentConfigResponse | null> => {
  try {
    if (!agentId || typeof agentId !== 'string') {
      return null;
    }

    const trimmedAgentId = agentId.trim();
    if (!trimmedAgentId) {
      return null;
    }

    const cachedConfigs = await AsyncStorage.getItem(AGENT_CONFIGS_MAP_KEY);
    if (!cachedConfigs) {
      return null;
    }

    const configMap: Record<string, AgentConfigResponse> =
      JSON.parse(cachedConfigs);
    return configMap[trimmedAgentId] || null;
  } catch (error) {
    return null;
  }
};

export const saveAgentConfigToCache = async (
  agentId: string,
  config: AgentConfigResponse
): Promise<void> => {
  if (!agentId || typeof agentId !== 'string') {
    throw new Error('Agent ID is required and must be a string');
  }

  const trimmedAgentId = agentId.trim();
  if (!trimmedAgentId) {
    throw new Error('Agent ID cannot be empty');
  }

  const cachedConfigs = await AsyncStorage.getItem(AGENT_CONFIGS_MAP_KEY);
  const configMap: Record<string, AgentConfigResponse> = cachedConfigs
    ? JSON.parse(cachedConfigs)
    : {};

  configMap[trimmedAgentId] = config;

  await AsyncStorage.setItem(AGENT_CONFIGS_MAP_KEY, JSON.stringify(configMap));
};

export const getAgentNameFromCache = async (
  agentId: string
): Promise<string | null> => {
  try {
    const config = await getAgentConfigFromCache(agentId);
    return config?.name || null;
  } catch (error) {
    return null;
  }
};

// ==================== Agent API Operations ====================

export const getAgentConfig = async (
  agentId?: string,
  userStore?: CDF['userStore']
): Promise<any> => {
  let finalAgentId: string = '';

  try {
    if (!agentId || agentId.trim() === '') {
      if (userStore) {
        finalAgentId = await getSelectedAgentId(userStore);
      } else {
        finalAgentId = DEFAULT_AGENT_ID;
      }
    } else {
      finalAgentId = agentId;
    }

    finalAgentId = finalAgentId.trim();

    if (!finalAgentId || finalAgentId === '') {
      throw new Error('Agent ID is required and cannot be empty');
    }

    const config = await fetchAgentConfig(finalAgentId);
    return config;
  } catch (error: any) {
    throw error;
  }
};

export const getWebSocketUrl = async (store: CDF): Promise<string | null> => {
  try {
    if (!store?.userStore) {
      return null;
    }

    const agentId = await getSelectedAgentId(store.userStore);

    let token: string | null = null;
    try {
      token = await ESPRMUser.getAccessToken();
    } catch (error) {
      token = await AsyncStorage.getItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN);
    }

    return `${AGENTS_WEBSOCKET_BASE_URL}/user/agents/${agentId}/ws?token=${token || ''}`;
  } catch (error) {
    return null;
  }
};

export function getToolConnectionStatus(
  toolUrl: string,
  connectors: ConnectedConnector[],
  expectedConnectorId?: string
): ToolConnectionStatus {
  // Ensure connectors is an array
  if (!Array.isArray(connectors) || connectors.length === 0) {
    return { isConnected: false, isExpired: false };
  }

  let connector: ConnectedConnector | undefined;
  
  if (toolUrl === RAINMAKER_MCP_CONNECTOR_URL && expectedConnectorId) {
    // For MCP connector, match by connectorId
    connector = connectors.find(
      (c) => c.connectorId === expectedConnectorId
    );
  }

  // If connector exists in array, it's connected
  if (!connector) {
    return { isConnected: false, isExpired: false };
  }

  return {
    isConnected: true,
    isExpired: false,
  };
}

