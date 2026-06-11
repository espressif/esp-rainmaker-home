/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentConfigResponse } from "./types";

type AgentConfigTool = NonNullable<AgentConfigResponse["tools"]>[number];

/**
 * Returns the enabled sub-tool names for an agent config tool entry.
 * Remote MCP tools expose `enabledTools`; local tools fall back to the tool name.
 * @param tool - Agent config tool entry
 * @returns List of enabled tool identifiers to display
 */
export function getAgentToolEnabledTools(tool: AgentConfigTool): string[] {
  if (Array.isArray(tool.enabledTools) && tool.enabledTools.length > 0) {
    return tool.enabledTools;
  }

  if (tool.name) {
    return [tool.name];
  }

  return [];
}

/**
 * Validates agent input fields
 * @param name - Agent name
 * @param agentId - Agent ID
 * @returns true if valid, false otherwise
 */
export const validateAgentInput = (
  name: string,
  agentId: string
): boolean => {
  return !!name.trim() && !!agentId.trim();
};

