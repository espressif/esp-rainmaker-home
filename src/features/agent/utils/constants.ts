/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
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

export const RAINMAKER_MCP_TOOL_NAME = "esp_rainmaker";

// AGENT CONFIG TOOL TYPES
export const AGENT_TOOL_TYPE_REMOTE = "remote";
export const AGENT_TOOL_AUTH_TYPE_OAUTH = "oauth";

export const DEFAULT_ANONYMOUS_NICKNAME = "Anonymous";

// LOCAL AGENT TOOLS (camera agent)
export const LOCAL_TOOL_NAMES = {
  GET_LATEST_FILES: "get_latest_files",
  GET_FILE_DOWNLOAD_INFO: "get_file_download_info",
  UPLOAD_FILE_TO_AGENT: "upload_snapshot_to_chat",
  WAIT_SECONDS: "wait_seconds",
  // Single-call capture: the device snapshots AND uploads straight into the
  // active conversation, returning the agent media reference. Replaces the
  // capture → poll → list → download → upload_snapshot_to_chat sequence.
  CAPTURE_SNAPSHOT: "capture_snapshot",
} as const;

/** Estimated user bubble height used when reserving agent response viewport space. */
export const AGENT_CHAT_USER_MESSAGE_ANCHOR_HEIGHT = 56;

/** Line height for chat composer text (matches `chatTextInput` styles). */
export const AGENT_CHAT_INPUT_LINE_HEIGHT = 22;

/** Minimum composer height for a single line (matches attach/send button size). */
export const AGENT_CHAT_INPUT_MIN_HEIGHT = 40;

/** Maximum visible composer lines before the field scrolls internally. */
export const AGENT_CHAT_INPUT_MAX_LINES = 5;

/** Thumbnail size for pending chat image attachments above the composer. */
export const AGENT_CHAT_ATTACHMENT_THUMB_SIZE = 72;

/** Maximum composer height derived from {@link AGENT_CHAT_INPUT_MAX_LINES}. */
export const AGENT_CHAT_INPUT_MAX_HEIGHT =
  AGENT_CHAT_INPUT_LINE_HEIGHT * AGENT_CHAT_INPUT_MAX_LINES;

/** Expo Router paths for agent flows. */
export const AGENT_ROUTE_PATH = {
  AGENT_SCAN: "/(agent)/AgentScan",
} as const;

/** Matches `/try/agents/:id` in full URLs or path-only QR payloads. */
export const AGENT_QR_SCAN_PATH_PATTERN = /\/try\/agents\/([^/\s?#]+)/;

/** Default pause between snapshot upload polling attempts (seconds). */
export const CAMERA_SNAPSHOT_POLL_INTERVAL_SEC = 5;

/** Delay before posting a capture_snapshot image message into chat (ms). */
export const CAPTURE_SNAPSHOT_MEDIA_MESSAGE_DELAY_MS = 2000;

/** Maximum seconds the `wait_seconds` local tool may sleep per call. */
export const LOCAL_TOOL_WAIT_SECONDS_MAX = 60;

/** Manual chat image attachment sources shown in the source picker sheet. */
export const CHAT_IMAGE_ATTACHMENT_SOURCE = {
  CAMERA: "camera",
  GALLERY: "gallery",
} as const;

export type ChatImageAttachmentSource =
  (typeof CHAT_IMAGE_ATTACHMENT_SOURCE)[keyof typeof CHAT_IMAGE_ATTACHMENT_SOURCE];

/** Usage percentage below which the stripe is blue. */
export const AGENT_USAGE_PERCENT_BLUE_MAX = 50;

/** Usage percentage below which the stripe is green (at or above blue max). */
export const AGENT_USAGE_PERCENT_GREEN_MAX = 75;

/** Usage percentage below which the stripe is warning (at or above green max). */
export const AGENT_USAGE_PERCENT_WARNING_MAX = 90;

/** Height of the usage progress stripe (px). */
export const AGENT_USAGE_STRIPE_HEIGHT = 3;

export const AGENT_SUGGESSTION_PROMOTS: Record<string, readonly string[]> = {
  esp_rainmaker_control: [
    "Can you show all my devices?",
    "Please turn on the Bedroom Fan",
    "Please set a schedule to turn on all my lights at 6pm everyday",
  ],
  CIYHF3B5KLSUZ5NQHYRASVJ2V6188MTJ: [
    "What is on my camera now?",
    "What is in-front of my camera now?",
    "我相机里现在拍到了什么? ",
    "我相机前面现在是什么？",
  ],
};

/**
 * Returns starter question prompts for an agent when the conversation is new.
 * @param agentId - Active agent identifier.
 * @returns Suggestion strings for the agent, or an empty list when none are configured.
 */
export function getAgentSuggestionPrompts(agentId: string): string[] {
  const trimmedAgentId = agentId.trim();
  if (!trimmedAgentId) {
    return [];
  }

  const prompts = AGENT_SUGGESSTION_PROMOTS[trimmedAgentId];
  return prompts ? [...prompts] : [];
}