/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import StorageAdapter from '@src/native-adaptors/implementations/ESPAsyncStorage';
import {
  AGENT_STORAGE_KEYS,
  CUSTOM_DATA_KEYS,
  CONVERSATION_EXPIRATION_MS,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  AGENT_SOURCE,
} from './constants';
import { DEFAULT_AGENT_ID } from '@/config/agent.config';
import type {
  AgentConfig,
  MessageDisplayConfig,
  ConversationData,
} from './types';
import { ESPCDFUser } from '@store';

// ==================== Agent Storage ====================

/**
 * Retrieves agents for downstream consumers.
 */
export const getAgents = (user: ESPCDFUser): AgentConfig[] => {
  try {
    const customData = user?.customData;
    let storedAgents: AgentConfig[] = [];

    if (customData?.[CUSTOM_DATA_KEYS.AI_AGENTS]?.value) {
      // Filter out default agent from stored agents (should not be stored)
      storedAgents = (
        customData[CUSTOM_DATA_KEYS.AI_AGENTS].value as AgentConfig[]
      )
        .filter(
          (agent) => agent.agentId !== DEFAULT_AGENT_ID && !agent.isDefault,
        )
        .map((agent) => ({
          ...agent,
          source: agent.source ?? AGENT_SOURCE.CUSTOM,
        }));
    }

    // Always include default agent from constants (never stored)
    const defaultAgent: AgentConfig = {
      id: 'default',
      name: 'Default Agent',
      agentId: DEFAULT_AGENT_ID,
      isDefault: true,
      source: AGENT_SOURCE.CUSTOM,
    };

    return [defaultAgent, ...storedAgents];
  } catch {
    // Return default agent even on error
    return [{
      id: 'default',
      name: 'Default Agent',
      agentId: DEFAULT_AGENT_ID,
      isDefault: true,
      source: AGENT_SOURCE.CUSTOM,
    }];
  }
};

/**
 * Handles save agents logic for this module.
 */
export const saveAgents = async (
  user: ESPCDFUser,
  agents: AgentConfig[]
): Promise<void> => {
  if (!user) {
    throw new Error('User store not available. Cannot save agents.');
  }

  // Filter out default agent - it should never be stored in custom data
  const agentsToSave = agents.filter(
    (agent) => agent.agentId !== DEFAULT_AGENT_ID && !agent.isDefault
  );

  const updatePayload = {
    [CUSTOM_DATA_KEYS.AI_AGENTS]: {
      value: agentsToSave,
      perms: [{ read: ['user', 'admin'], write: ['user'] }],
    },
  };

  await user.setCustomData(updatePayload);
};

/**
 * Retrieves selected agent id for downstream consumers.
 * Returns the persisted selection when set; only falls back to the default
 * agent when nothing is stored (template/user agents are not in local custom data).
 */
export const getSelectedAgentId = async (
  user: ESPCDFUser,
  agents?: AgentConfig[]
): Promise<string> => {
  try {
    if (!user) {
      return DEFAULT_AGENT_ID;
    }

    const customData = user.customData;
    const storedAgentId = customData?.[CUSTOM_DATA_KEYS.SELECTED_AI_AGENT]
      ?.value as string | undefined;

    if (storedAgentId && storedAgentId.trim() !== '') {
      const trimmedStoredId = storedAgentId.trim();

      if (agents && agents.length > 0) {
        const agentExists = agents.some(
          (agent) => agent.agentId.trim() === trimmedStoredId
        );
        if (agentExists) {
          return trimmedStoredId;
        }
      } else {
        return trimmedStoredId;
      }
    }

    const agentsList = agents || getAgents(user);
    const defaultAgent = agentsList.find((agent) => agent.isDefault);
    if (defaultAgent) {
      return defaultAgent.agentId;
    }
  } catch {
    // Silent error handling
  }

  return DEFAULT_AGENT_ID;
};

/**
 * Handles save selected agent logic for this module.
 */
export const saveSelectedAgent = async (
  user: ESPCDFUser,
  agentId: string
): Promise<void> => {
  if (!user) {
    throw new Error('User store not available. Cannot save selected agent.');
  }

  if (!agentId || typeof agentId !== 'string') {
    throw new Error('Agent ID must be a non-empty string');
  }

  const trimmedAgentId = agentId.trim();

  if (!trimmedAgentId || trimmedAgentId === '') {
    throw new Error('Agent ID cannot be empty');
  }

  const updatePayload = {
    [CUSTOM_DATA_KEYS.SELECTED_AI_AGENT]: {
      value: trimmedAgentId,
      perms: [{ read: ['user', 'admin'], write: ['user'] }],
    },
  };

  await user.setCustomData(updatePayload);
};

/**
 * Retrieves agents and selected id for downstream consumers.
 */
export const getAgentsAndSelectedId = async (
  user: ESPCDFUser
): Promise<{ agents: AgentConfig[]; selectedAgentId: string }> => {
  try {
    if (!user) {
      return Promise.resolve({
        agents: [],
        selectedAgentId: DEFAULT_AGENT_ID,
      });
    }

    const agents = getAgents(user);
    const selectedAgentId = await getSelectedAgentId(user, agents);

    return Promise.resolve({ agents, selectedAgentId });
  } catch {
    return Promise.resolve({
      agents: [],
      selectedAgentId: DEFAULT_AGENT_ID,
    });
  }
};

/**
 * Checks whether agents configured matches the expected condition.
 */
export const hasAgentsConfigured = (
  user: ESPCDFUser
): boolean => {
  try {
    if (!user) {
      return false;
    }
    const agents = getAgents(user);
    return agents.length > 0;
  } catch {
    return false;
  }
};

// ==================== Message Display Config Storage ====================

/**
 * Retrieves message display config for downstream consumers.
 */
export const getMessageDisplayConfig = async (): Promise<MessageDisplayConfig> => {
  try {
    const config = await StorageAdapter.getItem(
      AGENT_STORAGE_KEYS.MESSAGE_DISPLAY_CONFIG
    );
    if (config) {
      return JSON.parse(config);
    }
  } catch {
    // Silent error handling
  }

  return {
    showUser: true,
    showAssistant: true,
    showThinking: false,
    showToolCallInfo: false,
    showToolResultInfo: false,
    showUsageInfo: false,
    showTransactionEnd: false,
    showHandshakeAck: false,
  };
};

/**
 * Handles save message display config logic for this module.
 */
export const saveMessageDisplayConfig = async (
  config: MessageDisplayConfig
): Promise<void> => {
  await StorageAdapter.setItem(
    AGENT_STORAGE_KEYS.MESSAGE_DISPLAY_CONFIG,
    JSON.stringify(config)
  );
};

// ==================== Font Size Storage ====================

/**
 * Retrieves chat font size for downstream consumers.
 */
export const getChatFontSize = async (): Promise<number> => {
  try {
    const fontSize = await StorageAdapter.getItem(AGENT_STORAGE_KEYS.CHAT_FONT_SIZE);
    if (fontSize !== null) {
      const size = parseInt(fontSize, 10);
      if (size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) {
        return size;
      }
    }
  } catch {
    // Silent error handling
  }
  return DEFAULT_FONT_SIZE;
};

/**
 * Handles save chat font size logic for this module.
 */
export const saveChatFontSize = async (fontSize: number): Promise<void> => {
  const validSize = Math.max(
    MIN_FONT_SIZE,
    Math.min(MAX_FONT_SIZE, Math.round(fontSize))
  );
  await StorageAdapter.setItem(
    AGENT_STORAGE_KEYS.CHAT_FONT_SIZE,
    validSize.toString()
  );
};

// ==================== Conversation Storage ====================

/**
 * Checks whether conversation expired matches the expected condition.
 */
export const isConversationExpired = (timestamp: number): boolean => {
  const now = Date.now();
  const age = now - timestamp;
  return age > CONVERSATION_EXPIRATION_MS;
};

/**
 * Retrieves conversation id for downstream consumers.
 */
export const getConversationId = async (
  user?: ESPCDFUser
): Promise<string | null> => {
  try {
    if (!user) {
      return null;
    }

    const customData = user.customData;
    const stored = customData?.[CUSTOM_DATA_KEYS.CHAT_CONVERSATION_ID]?.value;

    if (!stored) {
      return null;
    }

    let parsed: ConversationData | null = null;

    if (typeof stored === 'string') {
      try {
        const jsonParsed = JSON.parse(stored);
        if (
          jsonParsed &&
          typeof jsonParsed === 'object' &&
          jsonParsed.conversationId &&
          jsonParsed.timestamp
        ) {
          parsed = jsonParsed;
        } else {
          await deleteConversationId(user);
          return null;
        }
      } catch {
        await deleteConversationId(user);
        return null;
      }
    } else if (typeof stored === 'object' && stored !== null) {
      if (stored.conversationId && stored.timestamp) {
        parsed = stored as ConversationData;
      } else {
        await deleteConversationId(user);
        return null;
      }
    } else {
      await deleteConversationId(user);
      return null;
    }

    if (!parsed) {
      return null;
    }

    if (isConversationExpired(parsed.timestamp)) {
      await deleteConversationId(user);
      return null;
    }

    return parsed.conversationId;
  } catch {
    return null;
  }
};

/**
 * Save conversation ID to custom data in user store
 * @param conversationId - Conversation ID
 * @param user - User entity from the CDF store
 * @returns Resolves when the conversation ID is saved
 */
export const saveConversationId = async (
  conversationId: string,
  user?: ESPCDFUser
): Promise<void> => {
  if (!conversationId || typeof conversationId !== 'string') {
    throw new Error('Conversation ID must be a non-empty string');
  }

  const trimmedConversationId = conversationId.trim();
  if (!trimmedConversationId) {
    throw new Error('Conversation ID cannot be empty');
  }

  if (!user) {
    throw new Error('User store not available. Cannot save conversation ID.');
  }

  const data: ConversationData = {
    conversationId: trimmedConversationId,
    timestamp: Date.now(),
  };

  const updatePayload = {
    [CUSTOM_DATA_KEYS.CHAT_CONVERSATION_ID]: {
      value: data,
      perms: [{ read: ['user', 'admin'], write: ['user'] }],
    },
  };

  await user.setCustomData(updatePayload);
};

/**
 * Handles delete conversation id logic for this module.
 */
export const deleteConversationId = async (
  user?: ESPCDFUser
): Promise<void> => {
  try {
    if (!user) {
      return;
    }

    const updatePayload = {
      [CUSTOM_DATA_KEYS.CHAT_CONVERSATION_ID]: {
        value: null,
        perms: [{ read: ['user', 'admin'], write: ['user'] }],
      },
    };

    await user.setCustomData(updatePayload);
  } catch {
    // Silent error handling
  }
};

// ==================== Agent Terms Acceptance ====================

/**
 * Get agent terms acceptance status from custom data
 * @param user - User instance
 * @returns boolean | null - true if accepted, false if disagreed, null if not set
 */
export const getAgentTermsAccepted = (
  user: ESPCDFUser
): boolean | null => {
  try {
    const customData = user?.customData;
    if (customData?.[CUSTOM_DATA_KEYS.AGENT_TERMS_ACCEPTED]?.value !== undefined) {
      return customData[CUSTOM_DATA_KEYS.AGENT_TERMS_ACCEPTED].value as boolean;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Set agent terms acceptance status in custom data
 * @param user - User instance
 * @param accepted - Acceptance status (true = accepted, false = disagreed)
 */
export const setAgentTermsAccepted = async (
  user: ESPCDFUser,
  accepted: boolean
): Promise<void> => {
  if (!user) {
    throw new Error('User store not available. Cannot save agent terms acceptance.');
  }

  const updatePayload = {
    [CUSTOM_DATA_KEYS.AGENT_TERMS_ACCEPTED]: {
      value: accepted,
      perms: [{ read: ['user', 'admin'], write: ['user'] }],
    },
  };

  await user.setCustomData(updatePayload);
};

