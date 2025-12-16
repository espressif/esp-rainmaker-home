/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { CDF } from '@espressif/rainmaker-base-cdf';
import { getTemplateAgents, getUserAgents, getAgentConfig, Agent } from '@/utils/apiHelper';
import { getAgents, saveAgents } from './storage';
import { AGENT_SOURCE, CUSTOM_DATA_KEYS } from './constants';
import { DEFAULT_AGENT_ID } from '@/config/agent.config';
import type { AgentConfig, AggregatedAgent, AgentValidationResult, AgentSource } from './types';

/**
 * Aggregates agents from all three sources:
 * 1. Template agents (common agents from API)
 * 2. User agents (from API)
 * 3. Custom data agents (from user storage)
 * 
 * Deduplicates by agentId with custom data taking precedence.
 * Orders as: Templates → User agents → Custom data
 * 
 * @param userStore - The CDF user store
 * @returns Promise with aggregated list of agents
 */
export async function getAllAgents(
  userStore?: CDF['userStore']
): Promise<AggregatedAgent[]> {
  try {
    // Fetch all sources in parallel
    const [templateAgents, userAgents, customAgents] = await Promise.all([
      getTemplateAgents().catch(() => [] as Agent[]),
      getUserAgents().catch(() => [] as Agent[]),
      userStore ? Promise.resolve(getAgents(userStore)) : Promise.resolve([] as AgentConfig[]),
    ]);

    // Convert to AggregatedAgent format
    const templateAggregated: AggregatedAgent[] = (templateAgents || []).map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      source: AGENT_SOURCE.TEMPLATE as AgentSource,
      adminId: agent.adminId,
      toolConfiguration: agent.toolConfiguration,
      modelId: agent.modelId,
      createdByName: agent.createdByName,
    }));

    const userAggregated: AggregatedAgent[] = (userAgents || []).map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      source: AGENT_SOURCE.USER as AgentSource,
      adminId: agent.adminId,
      toolConfiguration: agent.toolConfiguration,
      modelId: agent.modelId,
      createdByName: agent.createdByName,
    }));

    const customAggregated: AggregatedAgent[] = (customAgents || []).map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      source: AGENT_SOURCE.CUSTOM as AgentSource,
      isDefault: agent.isDefault,
    }));

    // Deduplicate: custom data takes precedence
    const agentMap = new Map<string, number>();
    const result: AggregatedAgent[] = [];
    
    // Separate default agent from custom agents
    const defaultAgent = customAggregated.find((a) => a.isDefault);
    const customAgentsWithoutDefault = customAggregated.filter((a) => !a.isDefault);

    // Step 1: Add default agent first (if exists)
    if (defaultAgent) {
      const key = defaultAgent.agentId.trim().toLowerCase();
      agentMap.set(key, result.length);
      result.push(defaultAgent);
    }

    // Step 2: Add user agents
    for (const agent of userAggregated) {
      const key = agent.agentId.trim().toLowerCase();
      if (!agentMap.has(key)) {
        agentMap.set(key, result.length);
        result.push(agent);
      }
    }

    // Step 3: Add custom stored agents (without default, skip if already exists from user)
    for (const agent of customAgentsWithoutDefault) {
      const key = agent.agentId.trim().toLowerCase();
      if (!agentMap.has(key)) {
        agentMap.set(key, result.length);
        result.push(agent);
      }
    }

    // Step 4: Add common agents (template agents, skip if already exists)
    for (const agent of templateAggregated) {
      const key = agent.agentId.trim().toLowerCase();
      if (!agentMap.has(key)) {
        agentMap.set(key, result.length);
        result.push(agent);
      }
    }

    return result;
  } catch (error) {
    console.error('Error aggregating agents:', error);
    // Return at least default agent if available
    if (userStore) {
      try {
        const customAgents = getAgents(userStore);
        const defaultAgent = customAgents.find((a) => a.isDefault);
        if (defaultAgent) {
          return [
            {
              agentId: defaultAgent.agentId,
              name: defaultAgent.name,
              source: AGENT_SOURCE.CUSTOM as AgentSource,
              isDefault: true,
            },
          ];
        }
      } catch (e) {
        // Fall through to empty array
      }
    }
    return [];
  }
}

/**
 * Validates an agent by calling getAgentConfig.
 * Only treats 404/not found errors as invalid.
 * Other errors (network, 500, etc.) are not treated as invalid.
 * 
 * @param agentId - The agent ID to validate
 * @returns Promise with validation result
 */
export async function validateAgent(
  agentId: string
): Promise<AgentValidationResult> {
  if (!agentId || typeof agentId !== 'string' || agentId.trim() === '') {
    return {
      isValid: false,
      error: 'Agent ID is required',
    };
  }

  try {
    await getAgentConfig(agentId.trim());
    return { isValid: true };
  } catch (error: any) {
    // Check if it's a 404/not found error
    if (error?.status === 404 || error?.status === '404') {
      return {
        isValid: false,
        error: 'Agent not found',
      };
    }

    // For other errors (network, 500, etc.), treat as valid
    // These are transient issues, not agent invalidity
    return { isValid: true };
  }
}

/**
 * Checks if an agent can be deleted based on its source.
 * Agents with source 'user' or 'template' (common) cannot be deleted.
 * Only custom agents can be deleted.
 * 
 * @param agent - Agent configuration with id field that reflects source
 * @returns true if agent can be deleted, false otherwise
 */
export function canDeleteAgentBySource(agent: AgentConfig): boolean {
  // Check if agent is default (cannot delete)
  if (agent.isDefault) {
    return false;
  }

  // Check source based on id prefix pattern:
  // - 'user_' prefix = user agent (source: 'user')
  // - 'template_' prefix = template/common agent (source: 'template')
  // - 'custom_' prefix = custom agent (source: 'custom')
  if (agent.source === AGENT_SOURCE.USER || agent.source === AGENT_SOURCE.TEMPLATE) {
    return false;
  }

  // Only custom agents (with 'custom_' prefix) can be deleted
  return true;
}

/**
 * Removes an invalid agent from custom data storage.
 * Only removes if the agent exists in custom data.
 * 
 * @param agentId - The agent ID to remove
 * @param userStore - The CDF user store
 */
export async function removeInvalidAgentFromCustomData(
  agentId: string,
  userStore: CDF['userStore']
): Promise<void> {
  if (!userStore?.user || !userStore?.userInfo) {
    return;
  }

  if (!agentId || typeof agentId !== 'string' || agentId.trim() === '') {
    return;
  }

  try {
    const trimmedAgentId = agentId.trim();
    
    // Don't remove default agent
    if (trimmedAgentId === DEFAULT_AGENT_ID) {
      return;
    }

    const customData = userStore.userInfo.customData;
    const storedAgents = (customData?.[CUSTOM_DATA_KEYS.AI_AGENTS]?.value as AgentConfig[]) || [];

    // Check if agent exists in custom data
    const agentExists = storedAgents.some(
      (agent) => agent.agentId.trim() === trimmedAgentId
    );

    if (!agentExists) {
      return;
    }

    // Remove agent from list
    const updatedAgents = storedAgents.filter(
      (agent) => agent.agentId.trim() !== trimmedAgentId
    );

    // Save updated list
    await saveAgents(userStore, [
      {
        id: 'default',
        name: 'Default Agent',
        agentId: DEFAULT_AGENT_ID,
        isDefault: true,
        source: AGENT_SOURCE.CUSTOM,
      },
      ...updatedAgents,
    ]);
  } catch (error) {
    console.error('Error removing invalid agent from custom data:', error);
    // Silent error handling - don't throw
  }
}

 