/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export const AGENT_STORAGE_KEYS = {
  CONFIGS_MAP: 'agents_config',
  MESSAGE_DISPLAY_CONFIG: 'message_display_config',
  CHAT_FONT_SIZE: 'chat_font_size',
  OAUTH_STATE_PREFIX: 'oauth_state_',
  CURRENT_OAUTH_STATE: 'current_oauth_state',
} as const;

export const CUSTOM_DATA_KEYS = {
  AI_AGENTS: 'ai_agents',
  SELECTED_AI_AGENT: 'selected_ai_agent',
  CHAT_CONVERSATION_ID: 'chat_conversation_id',
  AGENT_TERMS_ACCEPTED: 'agent_terms_accepted',
} as const;

export const CONVERSATION_EXPIRATION_MS = 4 * 60 * 60 * 1000; // 4 hours

export const AI_ASSISTANT_TYPES = ['ai-assistant', 'AI Assistant', 'ai assistant'] as const;

export const DEFAULT_FONT_SIZE = 2; // Medium size
export const MIN_FONT_SIZE = 1;
export const MAX_FONT_SIZE = 4;

export const TOKEN_STORAGE_KEYS = {
  ACCESS_TOKEN: 'com.esprmbase.accessToken',
  REFRESH_TOKEN: 'com.esprmbase.refreshToken',
} as const;

export const AGENT_SOURCE = {
  TEMPLATE: 'template',
  USER: 'user',
  CUSTOM: 'custom',
} as const;

export const RAINMAKER_MCP_CONNECTOR_ID = "https://mcp.rainmaker.espressif.com/api/mcp::1h7ujqjs8140n17v0ahb4n51m2";
