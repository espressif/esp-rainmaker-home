/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CDF } from '@espressif/rainmaker-base-cdf';
import {
  AGENT_STORAGE_KEYS,
  CUSTOM_DATA_KEYS,
  CONVERSATION_EXPIRATION_MS,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
} from './constants';
import { DEFAULT_AGENT_ID } from '@/config/agent.config';
import type {
  AgentConfig,
  MessageDisplayConfig,
  ConversationData,
} from './types';
import { getAllAgents } from "./aggregation"

// ==================== Agent Storage ====================

export const getAgents = (userStore: CDF['userStore']): AgentConfig[] => {
  try {
    const customData = userStore?.userInfo?.customData;
    let storedAgents: AgentConfig[] = [];

    if (customData?.[CUSTOM_DATA_KEYS.AI_AGENTS]?.value) {
      // Filter out default agent from stored agents (should not be stored)
      storedAgents = (customData[CUSTOM_DATA_KEYS.AI_AGENTS].value as AgentConfig[]).filter(
        (agent) => agent.agentId !== DEFAULT_AGENT_ID && !agent.isDefault
      );
    }

    // Always include default agent from constants (never stored)
    const defaultAgent: AgentConfig = {
      id: 'default',
      name: 'Default Agent',
      agentId: DEFAULT_AGENT_ID,
      isDefault: true,
    };

    return [defaultAgent, ...storedAgents];
  } catch (error) {
    // Return default agent even on error
    return [{
      id: 'default',
      name: 'Default Agent',
      agentId: DEFAULT_AGENT_ID,
      isDefault: true,
    }];
  }
};

export const saveAgents = async (
  userStore: CDF['userStore'],
  agents: AgentConfig[]
): Promise<void> => {
  if (!userStore?.user || !userStore?.userInfo) {
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

  const response = await userStore.user.setCustomData(updatePayload);
  if (response.status === 'success') {
    userStore.userInfo.customData = {
      ...(userStore.userInfo.customData ?? {}),
      ...updatePayload,
    };
  }
};

export const getSelectedAgentId = async (
  userStore: CDF['userStore'],
  agents?: AgentConfig[]
): Promise<string> => {
  try {
    if (!userStore?.userInfo) {
      return DEFAULT_AGENT_ID;
    }

    const customData = userStore.userInfo.customData;
    const storedAgentId = customData?.[CUSTOM_DATA_KEYS.SELECTED_AI_AGENT]
      ?.value as string | undefined;

    const agentsList = agents || await getAllAgents(userStore);

    if (storedAgentId && storedAgentId.trim() !== '') {
      const trimmedStoredId = storedAgentId.trim();
      const agentExists = agentsList.some(
        (agent) =>
          agent.agentId === trimmedStoredId ||
          agent.agentId.trim() === trimmedStoredId
      );

      if (agentExists) {
        return Promise.resolve(trimmedStoredId);
      }

      const defaultAgent = agentsList.find((agent) => agent.isDefault);
      if (defaultAgent) {
        return Promise.resolve(defaultAgent.agentId);
      }
    }

    const defaultAgent = agentsList.find((agent) => agent.isDefault);
    if (defaultAgent) {
      return Promise.resolve(defaultAgent.agentId);
    }
  } catch (error) {
    // Silent error handling
  }

  return Promise.resolve(DEFAULT_AGENT_ID);
};

export const saveSelectedAgent = async (
  userStore: CDF['userStore'],
  agentId: string
): Promise<void> => {
  if (!userStore?.user || !userStore?.userInfo) {
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

  const response = await userStore.user.setCustomData(updatePayload);
  if (response.status === 'success') {
    userStore.userInfo.customData = {
      ...(userStore.userInfo.customData ?? {}),
      ...updatePayload,
    };
  }
};

export const getAgentsAndSelectedId = async (
  userStore: CDF['userStore']
): Promise<{ agents: AgentConfig[]; selectedAgentId: string }> => {
  try {
    if (!userStore?.userInfo) {
      return Promise.resolve({
        agents: [],
        selectedAgentId: DEFAULT_AGENT_ID,
      });
    }

    const agents = getAgents(userStore);
    const selectedAgentId = await getSelectedAgentId(userStore, agents);

    return  Promise.resolve({ agents, selectedAgentId });
  } catch (error) {
    return  Promise.resolve({
      agents: [],
      selectedAgentId: DEFAULT_AGENT_ID,
    });
  }
};

export const hasAgentsConfigured = (
  userStore: CDF['userStore']
): boolean => {
  try {
    if (!userStore?.userInfo) {
      return false;
    }
    const agents = getAgents(userStore);
    return agents.length > 0;
  } catch (error) {
    return false;
  }
};

// ==================== Message Display Config Storage ====================

export const getMessageDisplayConfig = async (): Promise<MessageDisplayConfig> => {
  try {
    const config = await AsyncStorage.getItem(
      AGENT_STORAGE_KEYS.MESSAGE_DISPLAY_CONFIG
    );
    if (config) {
      return JSON.parse(config);
    }
  } catch (error) {
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

export const saveMessageDisplayConfig = async (
  config: MessageDisplayConfig
): Promise<void> => {
  await AsyncStorage.setItem(
    AGENT_STORAGE_KEYS.MESSAGE_DISPLAY_CONFIG,
    JSON.stringify(config)
  );
};

// ==================== Font Size Storage ====================

export const getChatFontSize = async (): Promise<number> => {
  try {
    const fontSize = await AsyncStorage.getItem(AGENT_STORAGE_KEYS.CHAT_FONT_SIZE);
    if (fontSize !== null) {
      const size = parseInt(fontSize, 10);
      if (size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) {
        return size;
      }
    }
  } catch (error) {
    // Silent error handling
  }
  return DEFAULT_FONT_SIZE;
};

export const saveChatFontSize = async (fontSize: number): Promise<void> => {
  const validSize = Math.max(
    MIN_FONT_SIZE,
    Math.min(MAX_FONT_SIZE, Math.round(fontSize))
  );
  await AsyncStorage.setItem(
    AGENT_STORAGE_KEYS.CHAT_FONT_SIZE,
    validSize.toString()
  );
};

// ==================== Conversation Storage ====================

export const isConversationExpired = (timestamp: number): boolean => {
  const now = Date.now();
  const age = now - timestamp;
  return age > CONVERSATION_EXPIRATION_MS;
};

export const getConversationId = async (
  userStore?: CDF['userStore']
): Promise<string | null> => {
  try {
    if (!userStore?.userInfo) {
      return null;
    }

    const customData = userStore.userInfo.customData;
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
          await deleteConversationId(userStore);
          return null;
        }
      } catch (parseError) {
        await deleteConversationId(userStore);
        return null;
      }
    } else if (typeof stored === 'object' && stored !== null) {
      if (stored.conversationId && stored.timestamp) {
        parsed = stored as ConversationData;
      } else {
        await deleteConversationId(userStore);
        return null;
      }
    } else {
      await deleteConversationId(userStore);
      return null;
    }

    if (!parsed) {
      return null;
    }

    if (isConversationExpired(parsed.timestamp)) {
      await deleteConversationId(userStore);
      return null;
    }

    return parsed.conversationId;
  } catch (error) {
    return null;
  }
};

export const saveConversationId = async (
  conversationId: string,
  userStore?: CDF['userStore']
): Promise<void> => {
  if (!conversationId || typeof conversationId !== 'string') {
    throw new Error('Conversation ID must be a non-empty string');
  }

  const trimmedConversationId = conversationId.trim();
  if (!trimmedConversationId) {
    throw new Error('Conversation ID cannot be empty');
  }

  if (!userStore?.user || !userStore?.userInfo) {
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

  const response = await userStore.user.setCustomData(updatePayload);
  if (response.status === 'success') {
    userStore.userInfo.customData = {
      ...(userStore.userInfo.customData ?? {}),
      ...updatePayload,
    };
  }
};

export const deleteConversationId = async (
  userStore?: CDF['userStore']
): Promise<void> => {
  try {
    if (!userStore?.user || !userStore?.userInfo) {
      return;
    }

    const updatePayload = {
      [CUSTOM_DATA_KEYS.CHAT_CONVERSATION_ID]: {
        value: null,
        perms: [{ read: ['user', 'admin'], write: ['user'] }],
      },
    };

    const response = await userStore.user.setCustomData(updatePayload);
    if (response.status === 'success') {
      const updatedCustomData = { ...(userStore.userInfo.customData ?? {}) };
      delete updatedCustomData[CUSTOM_DATA_KEYS.CHAT_CONVERSATION_ID];
      userStore.userInfo.customData = updatedCustomData;
    }
  } catch (error) {
    // Silent error handling
  }
};

// ==================== Agent Terms Acceptance ====================

/**
 * Get agent terms acceptance status from custom data
 * @param userStore - User store instance
 * @returns boolean | null - true if accepted, false if disagreed, null if not set
 */
export const getAgentTermsAccepted = (
  userStore: CDF['userStore']
): boolean | null => {
  try {
    const customData = userStore?.userInfo?.customData;
    if (customData?.[CUSTOM_DATA_KEYS.AGENT_TERMS_ACCEPTED]?.value !== undefined) {
      return customData[CUSTOM_DATA_KEYS.AGENT_TERMS_ACCEPTED].value as boolean;
    }
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Set agent terms acceptance status in custom data
 * @param userStore - User store instance
 * @param accepted - Acceptance status (true = accepted, false = disagreed)
 */
export const setAgentTermsAccepted = async (
  userStore: CDF['userStore'],
  accepted: boolean
): Promise<void> => {
  if (!userStore?.user || !userStore?.userInfo) {
    throw new Error('User store not available. Cannot save agent terms acceptance.');
  }

  const updatePayload = {
    [CUSTOM_DATA_KEYS.AGENT_TERMS_ACCEPTED]: {
      value: accepted,
      perms: [{ read: ['user', 'admin'], write: ['user'] }],
    },
  };

  const response = await userStore.user.setCustomData(updatePayload);
  if (response.status === 'success') {
    userStore.userInfo.customData = {
      ...(userStore.userInfo.customData ?? {}),
      ...updatePayload,
    };
  }
};

