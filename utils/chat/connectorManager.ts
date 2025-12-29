/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { CDF } from "@espressif/rainmaker-base-cdf";
import { ConnectedConnector } from "@/utils/apiHelper";
import {
  connectToolWithTokens
} from "@/utils/agent";
import { RAINMAKER_MCP_CONNECTOR_URL } from "@/config/agent.config";

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
    if (tool.url) {
      // Special handling for MCP connector - match by connectorId
      let connector: ConnectedConnector | undefined;
      if (tool.url === RAINMAKER_MCP_CONNECTOR_URL) {
        // For MCP connector, match by connectorId pattern: url::clientId
        const expectedConnectorId = tool.oauthMetadata?.clientId
          ? `${RAINMAKER_MCP_CONNECTOR_URL}::${tool.oauthMetadata.clientId}`
          : null;
        
        if (expectedConnectorId) {
          connector = connectedConnectors.find(
            (c) => c.connectorId === expectedConnectorId
          );
        }
      } else {
        // For other connectors, match by connectorUrl
        connector = connectedConnectors.find(
          (c) => c.connectorUrl === tool.url
        );
      }

      // If connector exists in array, it's connected
      if (!connector) {
        missingConnectors.push(tool.url);
      }
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
  store: CDF | null,
  config: any,
  loadConnectors: () => Promise<ConnectedConnector[]>,
  setIsConnectingConnector: (connecting: boolean) => void
): Promise<boolean> => {
  try {
    setIsConnectingConnector(true);

    // Get OAuth metadata from agent config tools array
    let oauthMetadata:
      | {
          tokenEndpoint?: string;
          clientId?: string;
          resource?: string;
        }
      | undefined;

    // Find Rainmaker MCP tool in tools array
    const rainmakerTool = config?.tools?.find(
      (tool: any) => tool.url === RAINMAKER_MCP_CONNECTOR_URL
    );

    if (rainmakerTool?.oauthMetadata) {
      oauthMetadata = {
        tokenEndpoint: rainmakerTool.oauthMetadata.tokenEndpoint,
        clientId: rainmakerTool.oauthMetadata.clientId,
        resource: rainmakerTool.oauthMetadata.resource,
      };
    }

    if (!store) {
      setIsConnectingConnector(false);
      return false;
    }

    // Check if connector with matching connectorId already exists
    const connectedConnectors = await loadConnectors();
    const expectedConnectorId = `${RAINMAKER_MCP_CONNECTOR_URL}::${oauthMetadata?.clientId || ''}`;
    const existingConnector = connectedConnectors.find(
      (c) => c.connectorId === expectedConnectorId
    );

    // If connector exists in array, it's already connected
    if (existingConnector) {
      setIsConnectingConnector(false);
      return true;
    }

    await connectToolWithTokens(
      store,
      RAINMAKER_MCP_CONNECTOR_URL,
      oauthMetadata
    );

    // Reload connectors after successful connection
    await loadConnectors();
    setIsConnectingConnector(false);
    return true;
  } catch (error) {
    setIsConnectingConnector(false);
    return false;
  }
};

