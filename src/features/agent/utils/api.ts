/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import StorageAdapter from '@native-adaptors/implementations/ESPAsyncStorage';

import { ESPCDFUser } from '@store';
import { getAgentConfig as fetchAgentConfig } from './apiHelper';
import type { ConnectedConnector } from '@src/types/global';
import { AGENTS_WEBSOCKET_BASE_URL, DEFAULT_AGENT_ID, RAINMAKER_MCP_CONNECTOR_URL } from '@/config/agent.config';
import {
  AGENT_TOOL_AUTH_TYPE_OAUTH,
  AGENT_TOOL_TYPE_REMOTE,
  RAINMAKER_MCP_TOOL_NAME,
  TOKEN_STORAGE_KEYS,
} from './constants';
import { getSelectedAgentId } from './storage';
import type { AgentConfigResponse } from './types';
import type { ToolConnectionStatus } from '@src/types/global';

// ==================== Agent Config Cache ====================

const AGENT_CONFIGS_MAP_KEY = 'agents_config';

/**
 * Retrieves agent config from cache for downstream consumers.
 */
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

    const cachedConfigs = await StorageAdapter.getItem(AGENT_CONFIGS_MAP_KEY);
    if (!cachedConfigs) {
      return null;
    }

    const configMap: Record<string, AgentConfigResponse> =
      JSON.parse(cachedConfigs);
    return configMap[trimmedAgentId] || null;
  } catch {
    return null;
  }
};

/**
 * Handles save agent config to cache logic for this module.
 */
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

  const cachedConfigs = await StorageAdapter.getItem(AGENT_CONFIGS_MAP_KEY);
  const configMap: Record<string, AgentConfigResponse> = cachedConfigs
    ? JSON.parse(cachedConfigs)
    : {};

  configMap[trimmedAgentId] = config;

  await StorageAdapter.setItem(AGENT_CONFIGS_MAP_KEY, JSON.stringify(configMap));
};

/**
 * Retrieves agent name from cache for downstream consumers.
 */
export const getAgentNameFromCache = async (
  agentId: string
): Promise<string | null> => {
  try {
    const config = await getAgentConfigFromCache(agentId);
    return config?.name || null;
  } catch {
    return null;
  }
};

// ==================== Agent API Operations ====================

/**
 * Retrieves agent config for downstream consumers.
 */
export const getAgentConfig = async (
  agentId?: string,
  user?: ESPCDFUser
): Promise<any> => {
  let finalAgentId: string = '';

  try {
    if (!agentId || agentId.trim() === '') {
      if (user) {
        finalAgentId = await getSelectedAgentId(user);
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

/**
 * Retrieves web socket url for downstream consumers.
 */
export const getWebSocketUrl = async (user: ESPCDFUser): Promise<string | null> => {
  try {
    if (!user) {
      return null;
    }
    const agentId = await getSelectedAgentId(user);
    let token: string | null = null;
    try {
      token = await user.getAccessToken();
    } catch {
      token = await StorageAdapter.getItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN);
    }

    return `${AGENTS_WEBSOCKET_BASE_URL}/user/agents/${agentId}/ws?token=${token || ''}`;
  } catch {
    return null;
  }
};

type RemoteToolRef = {
  type?: string;
  name?: string;
  url?: string;
};

/**
 * RainMaker MCP remote tools reuse the app's Cognito session (token passthrough)
 * instead of the web OAuth code flow, which requires HTTPS redirect URIs registered at DCR.
 * @param tool - Remote tool entry from agent config
 * @returns True when the tool is a RainMaker MCP connector
 */
export function isRainmakerMcpRemoteTool(tool: RemoteToolRef): boolean {
  if (tool.type && tool.type !== AGENT_TOOL_TYPE_REMOTE) {
    return false;
  }

  if (tool.name === RAINMAKER_MCP_TOOL_NAME) {
    return true;
  }

  if (!tool.url) {
    return false;
  }

  return (
    tool.url === RAINMAKER_MCP_CONNECTOR_URL ||
    tool.url.includes('mcp.rainmaker.espressif.com') ||
    tool.url.includes('esp-rainmaker-mcp')
  );
}

/**
 * Builds oauth metadata payload for token-passthrough connector connect.
 * @param oauthMetadata - Tool oauthMetadata from agent config
 * @returns Subset used by connectToolWithTokens
 */
export function toTokenConnectOAuthMetadata(
  oauthMetadata?: {
    tokenEndpoint?: string;
    clientId?: string;
    resource?: string;
  }
):
  | {
      tokenEndpoint?: string;
      clientId?: string;
      resource?: string;
    }
  | undefined {
  if (!oauthMetadata) {
    return undefined;
  }

  return {
    tokenEndpoint: oauthMetadata.tokenEndpoint,
    clientId: oauthMetadata.clientId,
    resource: oauthMetadata.resource,
  };
}

type AgentConfigTool = NonNullable<AgentConfigResponse['tools']>[number];

/**
 * Whether a tool entry requires user connector OAuth (connect/disconnect UI).
 * @param tool - Agent config tool entry
 * @returns True when the tool is a remote OAuth connector
 */
export function isConnectableRemoteTool(tool: AgentConfigTool): boolean {
  return (
    tool.type === AGENT_TOOL_TYPE_REMOTE &&
    tool.authType === AGENT_TOOL_AUTH_TYPE_OAUTH &&
    Boolean(tool.url) &&
    Boolean(tool.oauthMetadata?.clientId)
  );
}

/**
 * Builds the connector id used by the agents API (`connectorUrl::clientId`).
 * @param connectorUrl - Remote tool / MCP endpoint URL
 * @param clientId - OAuth client id from tool oauthMetadata
 * @returns Connector id string
 */
export function buildConnectorId(connectorUrl: string, clientId: string): string {
  return `${connectorUrl}::${clientId}`;
}

/**
 * Finds a stored connector that matches a remote tool's oauthMetadata.
 * @param toolUrl - Remote tool URL
 * @param clientId - OAuth client id from tool oauthMetadata
 * @param connectors - User's stored connectors
 * @returns Matching connector, if any
 */
export function findConnectorForRemoteTool(
  toolUrl: string,
  clientId: string,
  connectors: ConnectedConnector[]
): ConnectedConnector | undefined {
  if (!Array.isArray(connectors) || connectors.length === 0) {
    return undefined;
  }

  const expectedConnectorId = buildConnectorId(toolUrl, clientId);
  return connectors.find((connector) => connector.connectorId === expectedConnectorId);
}

/**
 * Retrieves tool connection status for downstream consumers.
 * Connected means the connector exists with a valid token: hasToken && !isExpired.
 * @param toolUrl - Remote tool URL
 * @param connectors - User's stored connectors
 * @param clientId - OAuth client id from tool oauthMetadata
 * @returns Connection status
 */
export function getToolConnectionStatus(
  toolUrl: string,
  connectors: ConnectedConnector[],
  clientId?: string
): ToolConnectionStatus {
  if (!toolUrl || !clientId || !Array.isArray(connectors) || connectors.length === 0) {
    return { isConnected: false, isExpired: false };
  }

  const connector = findConnectorForRemoteTool(toolUrl, clientId, connectors);
  if (!connector) {
    return { isConnected: false, isExpired: false };
  }

  const isExpired = connector.isExpired ?? false;
  const hasToken = connector.hasToken ?? false;

  return {
    isConnected: hasToken && !isExpired,
    isExpired,
  };
}

