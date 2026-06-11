/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDF } from "@store";
import { ConnectedConnector } from "../apiHelper";
import {
  connectToolWithTokens,
  getToolConnectionStatus,
  isRainmakerMcpRemoteTool,
  toTokenConnectOAuthMetadata,
} from "@features/agent/utils";
import {
  AGENT_TOOL_AUTH_TYPE_OAUTH,
  AGENT_TOOL_TYPE_REMOTE,
} from "@features/agent/utils/constants";

export interface ConnectorCheckResult {
  allConnected: boolean;
  missingConnectors: string[];
}

/**
 * Check if all required connectors are connected
 * @param config - Agent config
 * @param connectedConnectors - List of connected connectors
 * @returns Check result with missing connectors
 */
export const checkRequiredConnectors = (
  config: any,
  connectedConnectors: ConnectedConnector[]
): ConnectorCheckResult => {
  // Check tools array (new API structure)
  const tools = config?.tools || [];

  // If no tools, consider all connected
  if (tools.length === 0) {
    return { allConnected: true, missingConnectors: [] };
  }

  const missingConnectors: string[] = [];

  for (const tool of tools) {
    if (
      tool.type !== AGENT_TOOL_TYPE_REMOTE ||
      tool.authType !== AGENT_TOOL_AUTH_TYPE_OAUTH ||
      !tool.url ||
      !tool.oauthMetadata?.clientId
    ) {
      continue;
    }

    const { isConnected } = getToolConnectionStatus(
      tool.url,
      connectedConnectors,
      tool.oauthMetadata.clientId
    );

    if (!isConnected) {
      missingConnectors.push(tool.url);
    }
  }

  return {
    allConnected: missingConnectors.length === 0,
    missingConnectors,
  };
};

/**
 * Auto-connect Rainmaker MCP connector
 * @param store - CDF store
 * @param config - Agent config
 * @param loadConnectors - Function to reload connectors
 * @param setIsConnectingConnector - Function to set connecting state
 * @returns Success status
 */
export const autoConnectRainmakerMCP = async (
  store: ESPCDF | null,
  config: any,
  loadConnectors: () => Promise<ConnectedConnector[]>,
  setIsConnectingConnector: (connecting: boolean) => void
): Promise<boolean> => {
  try {
    setIsConnectingConnector(true);

    const rainmakerTool = config?.tools?.find((tool: { type?: string; name?: string; url?: string }) =>
      isRainmakerMcpRemoteTool(tool)
    );

    if (!rainmakerTool?.url) {
      setIsConnectingConnector(false);
      return false;
    }

    const oauthMetadata = toTokenConnectOAuthMetadata(rainmakerTool.oauthMetadata);
    const connectorUrl = rainmakerTool.url;

    if (!store) {
      setIsConnectingConnector(false);
      return false;
    }

    // Check if connector with matching connectorId already exists and is active
    const connectedConnectors = await loadConnectors();
    const clientId = oauthMetadata?.clientId || '';
    const { isConnected } = getToolConnectionStatus(
      connectorUrl,
      connectedConnectors,
      clientId
    );

    if (isConnected) {
      setIsConnectingConnector(false);
      return true;
    }

    await connectToolWithTokens(store, connectorUrl, oauthMetadata);

    // Reload connectors after successful connection
    await loadConnectors();
    setIsConnectingConnector(false);
    return true;
  } catch {
    setIsConnectingConnector(false);
    return false;
  }
};

