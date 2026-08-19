/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFUser } from "@store";
import type { AgentConfig } from "./types";
import { AGENT_SOURCE } from "./constants";
import { deleteConversationId } from "./storage";

interface RegisterAgentFromSettingsScanParams {
  user: ESPCDFUser;
  agentId: string;
  agentName: string | null;
  addAgent: (name: string, agentId: string) => Promise<{ isUpdate: boolean }>;
  selectAgent: (agent: AgentConfig) => Promise<void>;
}

/**
 * Persists a scanned agent for chat and selects it as the active agent.
 * @param params - Agent id, display name, and store mutators from {@link useAgent}
 * @returns Whether an existing agent entry was updated
 */
export async function registerAgentFromSettingsScan(
  params: RegisterAgentFromSettingsScanParams,
): Promise<{ isUpdate: boolean }> {
  const trimmedId = params.agentId.trim();
  const trimmedName = (params.agentName || params.agentId).trim();
  const result = await params.addAgent(trimmedName, trimmedId);

  const agentToActivate: AgentConfig = {
    id: `custom_${trimmedId}`,
    name: trimmedName,
    agentId: trimmedId,
    isDefault: false,
    source: AGENT_SOURCE.CUSTOM,
  };

  await params.selectAgent(agentToActivate);
  await deleteConversationId(params.user);
  return result;
}
