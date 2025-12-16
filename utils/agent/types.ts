/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AgentConfig {
  id: string;
  name: string;
  agentId: string;
  isDefault: boolean;
  source: AgentSource;
}

export interface AgentConfigResponse {
  agentId: string;
  name: string;
  textModelId: string;
  speechModelId: string;
  modelCapabilities: {
    supportsText: boolean;
    supportsVoice: boolean;
  };
  textModelCapabilities?: {
    supportsText: boolean;
    supportsVoice: boolean;
    displayName: string;
    description: string;
  };
  speechModelCapabilities?: {
    supportsText: boolean;
    supportsVoice: boolean;
    displayName: string;
    description: string;
  };
  requiredConnectors?: Array<{
    connectorUrl: string;
    description: string;
    type: string;
    authType: string;
    oauthMetadata?: OAuthMetadata;
  }>;
  tools?: Array<{
    type: string;
    name: string;
    url: string;
    timeout: number;
    authType: string;
  }>;
  createdByName?: string;
}

export type FontSizeLevel = 'small' | 'medium' | 'large' | 'extraLarge';

export interface MessageDisplayConfig {
  showUser: boolean;
  showAssistant: boolean;
  showThinking: boolean;
  showToolCallInfo: boolean;
  showToolResultInfo: boolean;
  showUsageInfo: boolean;
  showTransactionEnd: boolean;
  showHandshakeAck: boolean;
}

export interface WebSocketMessage {
  type:
    | 'user'
    | 'assistant'
    | 'thinking'
    | 'tool_call_info'
    | 'tool_result_info'
    | 'usage_info'
    | 'transaction_end'
    | 'handshake'
    | 'handshake_ack'
    | 'timeout';
  content_type: 'text' | 'json';
  content: string | object;
  metadata?: {
    timestamp?: number;
    sequence_number?: number;
    role?: string;
    total_duration_ms?: number;
  };
}

export interface OAuthMetadata {
  resource?: string;
  authorizationServers?: string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopesSupported?: string[];
  clientId?: string;
  dynamicallyRegistered?: boolean;
}

export interface OAuthState {
  connectorUrl: string;
  codeVerifier?: string;
  redirectUri: string;
  returnUrl?: string;
  tokenEndpoint?: string;
  resource?: string;
  clientId?: string;
}

export interface ConversationData {
  conversationId: string;
  timestamp: number;
}

export type AgentSource = 'template' | 'user' | 'custom';

export interface AggregatedAgent {
  agentId: string;
  name: string;
  source: AgentSource;
  adminId?: string;
  toolConfiguration?: string;
  modelId?: string;
  createdByName?: string;
  isDefault?: boolean;
}

export interface AgentValidationResult {
  isValid: boolean;
  error?: string;
}

