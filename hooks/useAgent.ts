/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import {
  saveAgents,
  saveSelectedAgent,
  getAgentsAndSelectedId,
  getSelectedAgentId,
  getAgentConfig,
  getWebSocketUrl,
  getMessageDisplayConfig,
  saveMessageDisplayConfig,
  getConversationId,
  saveConversationId,
  deleteConversationId,
  connectToolWithOAuth,
  connectToolWithTokens,
  getToolConnectionStatus,
  type AgentConfig,
  type MessageDisplayConfig,
  type OAuthMetadata,
} from '@/utils/agent';
import {
  getConnectedConnectors,
  disconnectConnector,
  getConversationByAgent,
  deleteConversationByAgent,
  type ConnectedConnector,
} from '@/utils/apiHelper';
import { DEFAULT_AGENT_ID, OAUTH_REDIRECT_URI } from '@/config/agent.config';
import { CUSTOM_DATA_KEYS } from '@/utils/agent/constants';
import { useCDF } from '@/hooks/useCDF';

/**
 * Hook for managing agent-related operations
 * Provides centralized state and functions for agent management, configuration, connectors, and conversations
 */
export const useAgent = () => {
  const { store } = useCDF();

  // Agent management state
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);

  // Agent config state
  const [agentConfig, setAgentConfig] = useState<any>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Connectors state
  const [connectors, setConnectors] = useState<ConnectedConnector[]>([]);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);
  const [connectingToolUrl, setConnectingToolUrl] = useState<string | null>(null);
  const [disconnectingToolUrl, setDisconnectingToolUrl] = useState<string | null>(null);

  // Message display config state
  const [messageDisplayConfig, setMessageDisplayConfig] = useState<MessageDisplayConfig>({
    showUser: true,
    showAssistant: true,
    showThinking: false,
    showToolCallInfo: false,
    showToolResultInfo: false,
    showUsageInfo: false,
    showTransactionEnd: false,
    showHandshakeAck: false,
  });

  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);

  // ==================== Agent Management ====================

  /**
   * Fetch agents from storage and ensure default agent exists
   * Reads directly from userStore.userInfo.customData (reactive, no API call)
   */
  const fetchAgents = useCallback(async () => {
    try {
      setIsLoadingAgents(true);
      
      if (!store?.userStore) {
        throw new Error('Store not available');
      }
      
      // Read directly from reactive store (no API call)
      // getAgents always includes default agent from constants, never from storage
      const { agents: allAgents, selectedAgentId: currentSelectedId } = 
       await getAgentsAndSelectedId(store.userStore);

      // Default agent is always included from getAgents (from constants)
      // No need to save it - it's never stored in custom data
      setAgents(allAgents);
      setSelectedAgentId(currentSelectedId);
    } catch (error) {
      // Even on error, show default agent from constants (never stored)
      const defaultAgent: AgentConfig = {
        id: 'default',
        name: 'Default Agent',
        agentId: DEFAULT_AGENT_ID,
        isDefault: true,
        source: 'custom',
      };
      setAgents([defaultAgent]);
      setSelectedAgentId(DEFAULT_AGENT_ID);
    } finally {
      setIsLoadingAgents(false);
    }
  }, [store]);

  /**
   * Add a new agent or update existing one if agentId already exists
   */
  const addAgent = useCallback(
    async (name: string, agentId: string): Promise<{ isUpdate: boolean }> => {
      if (!name.trim() || !agentId.trim()) {
        throw new Error('Name and Agent ID are required');
      }

      const trimmedName = name.trim();
      const trimmedAgentId = agentId.trim();

      // Check if agent with same agentId already exists
      const existingAgentIndex = agents.findIndex(
        (agent) => agent.agentId.trim() === trimmedAgentId
      );

      let updatedAgents: AgentConfig[];
      let isUpdate = false;

      if (existingAgentIndex !== -1) {
        // Update existing agent's name
        isUpdate = true;
        updatedAgents = [...agents];
        updatedAgents[existingAgentIndex] = {
          ...updatedAgents[existingAgentIndex],
          name: trimmedName,
        };
      } else {
        // Create new agent
        const newAgent: AgentConfig = {
          id: `agent_${Date.now()}`,
          name: trimmedName,
          agentId: trimmedAgentId,
          isDefault: false,
          source: "custom"
        };
        updatedAgents = [...agents, newAgent];
      }

      if (!store?.userStore) {
        throw new Error('Store not available');
      }
      
      await saveAgents(store.userStore, updatedAgents);
      setAgents(updatedAgents);
      return { isUpdate };
    },
    [agents, store]
  );

  /**
   * Select an agent (set as active)
   */
  const selectAgent = useCallback(async (agent: AgentConfig): Promise<void> => {
    try {
      // Validate and trim agentId before saving
      if (!agent.agentId || agent.agentId.trim() === '') {
        throw new Error('Invalid agent ID');
      }

      const trimmedAgentId = agent.agentId.trim();

      if (!store?.userStore) {
        throw new Error('Store not available');
      }
      
      await saveSelectedAgent(store.userStore, trimmedAgentId);
      setSelectedAgentId(trimmedAgentId);
    } catch (error) {
      throw error;
    }
  }, [store]);

  /**
   * Delete an agent
   */
  const deleteAgent = useCallback(
    async (agentToDelete: AgentConfig): Promise<void> => {
      if (agentToDelete.isDefault) {
        throw new Error('Cannot delete default agent');
      }

      if (!store?.userStore) {
        throw new Error('Store not available');
      }

      // Fetch fresh agents from storage instead of relying on state,
      // since Settings.tsx shows aggregated agents but we only need to delete from custom storage
      const { agents: currentAgents } = await getAgentsAndSelectedId(store.userStore);
      
      // Filter by agentId instead of id, since agentId is the unique identifier
      // and id format can vary between different contexts (Settings vs useAgent state)
      const updatedAgents = currentAgents.filter((a) => a.agentId !== agentToDelete.agentId);
      
      // Save agents and selected agent in one batch update if needed
      if (selectedAgentId === agentToDelete.agentId) {
        const defaultAgent = updatedAgents.find((a) => a.isDefault) || updatedAgents[0];
        const newSelectedId = defaultAgent ? defaultAgent.agentId : DEFAULT_AGENT_ID;
        
        // Filter out default agent before saving (should never be stored)
        const agentsToSave = updatedAgents.filter(
          (agent) => agent.agentId !== DEFAULT_AGENT_ID && !agent.isDefault
        );
        
        // Update both in one setCustomData call
        const updatePayload = {
          [CUSTOM_DATA_KEYS.AI_AGENTS]: {
            value: agentsToSave,
            perms: [{ read: ["user", "admin"], write: ["user"] }],
          },
          [CUSTOM_DATA_KEYS.SELECTED_AI_AGENT]: {
            value: newSelectedId,
            perms: [{ read: ["user", "admin"], write: ["user"] }],
          },
        };
        
        // Save to API
        const response = await store.userStore.user?.setCustomData(updatePayload);
        if (response?.status === 'success' && store.userStore.userInfo) {
          // Update userInfo.customData reactively
          store.userStore.userInfo.customData = {
            ...(store.userStore.userInfo.customData ?? {}),
            ...updatePayload,
          };
        }
        setSelectedAgentId(newSelectedId);
      } else {
        // Only update agents (saveAgents already filters out default agent)
        await saveAgents(store.userStore, updatedAgents);
      }

      setAgents(updatedAgents);
    },
    [selectedAgentId, store]
  );

  // ==================== Agent Config ====================

  /**
   * Load agent configuration from API
   */
  const loadAgentConfig = useCallback(async (agentId?: string): Promise<any> => {
    setIsLoadingConfig(true);
    setConfigError(null);
    try {
      // getAgentConfig needs userStore to get selectedAgentId from reactive store
      if (!agentId && store?.userStore) {
        // If no agentId provided, get from reactive store
        agentId = await getSelectedAgentId(store.userStore);
      }
      const config = await getAgentConfig(agentId, store?.userStore);
      setAgentConfig(config);
      return config;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load agent configuration';
      setConfigError(errorMessage);
      throw err;
    } finally {
      setIsLoadingConfig(false);
    }
  }, [store]);

  /**
   * Get WebSocket URL for the selected agent
   */
  const getWebSocketUrlForAgent = useCallback(async (): Promise<string | null> => {
    return await getWebSocketUrl(store);
  }, [store]);

  // ==================== Connectors ====================

  /**
   * Load connected connectors
   */
  const loadConnectors = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingConnectors(true);
      const connectedConnectors = await getConnectedConnectors();
      setConnectors(connectedConnectors);
    } catch (err: any) {
      console.error('Failed to load connectors:', err);
    } finally {
      setIsLoadingConnectors(false);
    }
  }, []);

  /**
   * Get tool connection status
   */
  const getToolConnectionStatusHook = useCallback(
    (toolUrl: string, expectedConnectorId?: string): { isConnected: boolean; isExpired: boolean } => {
      return getToolConnectionStatus(toolUrl, connectors, expectedConnectorId);
    },
    [connectors]
  );

  /**
   * Connect a tool using OAuth flow
   */
  const connectTool = useCallback(
    async (
      toolUrl: string,
      oauthMetadata: OAuthMetadata,
      fallbackClientId?: string
    ): Promise<void> => {
      setConnectingToolUrl(toolUrl);
      try {
        const redirectUri = OAUTH_REDIRECT_URI;
        const clientId = fallbackClientId || oauthMetadata.clientId || '';

        await connectToolWithOAuth(toolUrl, oauthMetadata, redirectUri, clientId);
        await loadConnectors();
      } catch (err: any) {
        throw err;
      } finally {
        setConnectingToolUrl(null);
      }
    },
    [loadConnectors]
  );

  /**
   * Connect a tool using tokens directly (for MCP connector)
   */
  const connectToolWithTokensDirect = useCallback(
    async (
      toolUrl: string,
      oauthMetadata?: {
        tokenEndpoint?: string;
        clientId?: string;
        resource?: string;
      }
    ): Promise<void> => {
      setConnectingToolUrl(toolUrl);
      try {
        await connectToolWithTokens(store, toolUrl, oauthMetadata);
        await loadConnectors();
      } catch (err: any) {
        throw err;
      } finally {
        setConnectingToolUrl(null);
      }
    },
    [store, loadConnectors]
  );

  /**
   * Disconnect a tool
   */
  const disconnectTool = useCallback(
    async (toolUrl: string, clientId?: string, authType?: string): Promise<void> => {
      setDisconnectingToolUrl(toolUrl);
      try {
        await disconnectConnector(toolUrl, clientId, authType);
        await loadConnectors();
      } catch (err: any) {
        throw err;
      } finally {
        setDisconnectingToolUrl(null);
      }
    },
    [loadConnectors]
  );

  // ==================== Message Display Config ====================

  /**
   * Load message display configuration
   */
  const loadMessageDisplayConfig = useCallback(async (): Promise<void> => {
    try {
      const config = await getMessageDisplayConfig();
      setMessageDisplayConfig(config);
    } catch (error) {
      // Use default config
      const defaultConfig: MessageDisplayConfig = {
        showUser: true,
        showAssistant: true,
        showThinking: false,
        showToolCallInfo: false,
        showToolResultInfo: false,
        showUsageInfo: false,
        showTransactionEnd: false,
        showHandshakeAck: false,
      };
      setMessageDisplayConfig(defaultConfig);
    }
  }, []);

  /**
   * Update message display configuration
   */
  const updateMessageDisplayConfig = useCallback(
    async (config: MessageDisplayConfig): Promise<void> => {
      try {
        await saveMessageDisplayConfig(config);
        setMessageDisplayConfig(config);
      } catch (error) {
        throw error;
      }
    },
    []
  );

  // ==================== Conversation Management ====================

  /**
   * Load conversation ID from storage
   */
  const loadConversationId = useCallback(async (): Promise<void> => {
    try {
      if (!store?.userStore) {
        setConversationId(null);
        return;
      }
      const storedConversationId = await getConversationId(store.userStore);
      setConversationId(storedConversationId);
    } catch (error) {
      setConversationId(null);
    }
  }, [store]);

  /**
   * Save conversation ID to storage
   */
  const saveConversationIdToStorage = useCallback(async (id: string): Promise<void> => {
    try {
      if (!store?.userStore) {
        throw new Error('Store not available');
      }
      await saveConversationId(id, store.userStore);
      setConversationId(id);
    } catch (error) {
      throw error;
    }
  }, [store]);

  /**
   * Delete conversation ID from storage
   */
  const deleteConversationIdFromStorage = useCallback(async (): Promise<void> => {
    try {
      if (!store?.userStore) {
        setConversationId(null);
        return;
      }
      await deleteConversationId(store.userStore);
      setConversationId(null);
    } catch (error) {
      throw error;
    }
  }, [store]);

  /**
   * Get conversation by agent and conversation ID
   */
  const getConversation = useCallback(
    async (agentId: string, conversationId: string) => {
      return await getConversationByAgent(agentId, conversationId);
    },
    []
  );

  /**
   * Delete conversation by agent and conversation ID
   */
  const deleteConversation = useCallback(
    async (agentId: string, conversationId: string): Promise<void> => {
      await deleteConversationByAgent(agentId, conversationId);
      await deleteConversationIdFromStorage();
    },
    [deleteConversationIdFromStorage]
  );

  // ==================== Effects ====================

  // Load agents on mount
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Load message display config on mount
  useEffect(() => {
    loadMessageDisplayConfig();
  }, [loadMessageDisplayConfig]);

  // Load conversation ID on mount
  useEffect(() => {
    loadConversationId();
  }, [loadConversationId]);

  return {
    // Agent management
    agents,
    selectedAgentId,
    isLoadingAgents,
    fetchAgents,
    addAgent,
    selectAgent,
    deleteAgent,

    // Agent config
    agentConfig,
    isLoadingConfig,
    configError,
    loadAgentConfig,
    getWebSocketUrlForAgent,

    // Connectors
    connectors,
    isLoadingConnectors,
    connectingToolUrl,
    disconnectingToolUrl,
    loadConnectors,
    getToolConnectionStatus: getToolConnectionStatusHook,
    connectTool,
    connectToolWithTokensDirect,
    disconnectTool,

    // Message display config
    messageDisplayConfig,
    loadMessageDisplayConfig,
    updateMessageDisplayConfig,

    // Conversation
    conversationId,
    loadConversationId,
    saveConversationIdToStorage,
    deleteConversationIdFromStorage,
    getConversation,
    deleteConversation,
  };
};

