/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode, ESPCDFDevice, ESPCDFDeviceParam } from '@store';
import type { ViewStyle, TextStyle } from 'react-native';

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
  requiredConnectors?: {
    connectorUrl: string;
    description: string;
    type: string;
    authType: string;
    oauthMetadata?: OAuthMetadata;
  }[];
  tools?: {
    type: string;
    name: string;
    url?: string;
    timeout?: number;
    authType?: string;
    description?: string;
    enabledTools?: string[];
    oauthMetadata?: OAuthMetadata;
    inputSchema?: Record<string, unknown>;
  }[];
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

export interface AgentChatMediaReference {
  type: string;
  media_id: string;
  s3_key: string;
  content_type: string;
  filename: string;
  // Optional: for device-captured snapshots the size isn't returned by the
  // device; the backend can derive it from the referenced S3 object.
  size_bytes?: number;
}

export interface AgentMultimodalMessageContent {
  text: string;
  media: AgentChatMediaReference[];
}

export interface AgentMediaTypeConfig {
  mime_types: string[];
  max_size_bytes: number;
  max_size_mb: number;
}

export interface AgentMediaConfig {
  allowed_types: Record<string, AgentMediaTypeConfig>;
  max_files_per_message: number;
  all_allowed_mime_types: string[];
}

export interface AgentMediaUploadUrlRequest {
  conversation_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

export interface AgentMediaUploadUrlResponse {
  upload_url: string;
  media_id: string;
  s3_key: string;
  content_type: string;
  filename: string;
  size_bytes: number;
  type: string;
  expires_in: number;
}

export interface PendingChatMediaAttachment {
  uri: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  mediaType: string;
}

export interface WebSocketMessage {
  type:
  | 'user'
  | 'assistant'
  | 'assistant_delta'
  | 'thinking'
  | 'thinking_delta'
  | 'tool_call_info'
  | 'tool_result_info'
  | 'tool_request'
  | 'tool_response'
  | 'usage_info'
  | 'transaction_end'
  | 'handshake'
  | 'handshake_ack'
  | 'timeout';
  content_type: 'text' | 'json' | 'multimodal';
  content: string | object | AgentMultimodalMessageContent;
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
  registeredRedirectUris?: string[];
  clientSecret?: string;
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

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Props for AgentSelectionItem component
 */
export interface AgentSelectionItemProps {
  agent: Agent;
  isSelected: boolean;
  onPress: () => void;
}

/**
 * Props for AgentCard component
 */
export interface AgentCardProps {
  agent: AgentConfig;
  isSelected: boolean;
  isEditing: boolean;
  isLoading?: boolean;
  onPress: () => void;
  onDelete?: () => void;
}

/**
 * Props for AgentInfoSection component
 */
export interface AgentInfoSectionProps {
  agentId: string;
  name: string;
  createdByName?: string;
  textModelId: string;
  speechModelId: string;
  conversationId?: string | null;
}

/**
 * Props for AddAgentBottomSheet component
 */
export interface AddAgentBottomSheetProps {
  /** Whether the bottom sheet is visible */
  visible: boolean;
  /** Callback when bottom sheet is closed */
  onClose: () => void;
  /** Callback when agent is saved */
  onSave: (name: string, agentId: string) => void;
  /** Optional initial agent ID to pre-fill */
  initialAgentId?: string;
  /** Optional initial agent name to pre-fill */
  initialAgentName?: string;
  /** List of existing agents to check for duplicates */
  existingAgents?: AgentConfig[];
}

/**
 * Props for AgentTermsBottomSheet component
 */
export interface AgentTermsBottomSheetProps {
  /** Whether the bottom sheet is visible */
  visible: boolean;
  /** Callback when bottom sheet is closed */
  onClose: () => void;
  /** Callback when terms are accepted and profile is saved */
  onComplete: () => void;
  /** Whether to allow closing the sheet (if false, user must complete) */
  allowClose?: boolean;
}

// ============================================================================
// API Types (from utils/apiHelper.ts)
// ============================================================================

/**
 * Agent interface from API
 */
export interface Agent {
  adminId: string;
  agentId: string;
  name: string;
  toolConfiguration?: string;
  modelId?: string;
  createdByName?: string;
}

/**
 * Conversation message interface
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | AgentMultimodalMessageContent;
  /** Media references when the API stores them on the message row (not inside content). */
  media?: AgentChatMediaReference[];
  timestamp: number;
  toolCalls?: {
    name: string;
    input: Record<string, any>;
    toolUseId: string;
  }[];
  toolResults?: {
    toolUseId: string;
    result: any;
  }[];
}

/**
 * Conversation interface
 */
export interface Conversation {
  conversationId: string;
  userId: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  messages?: ConversationMessage[];
}

/**
 * Conversation list item interface
 */
export interface ConversationListItem {
  conversationId: string;
  title: string;
  agentId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// ============================================================================
// User Profile Types (from utils/apiHelper.ts)
// ============================================================================

/**
 * User profile interface
 */
export interface UserProfile {
  userId: string;
  email: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

// ============================================================================
// Connector Types (from utils/apiHelper.ts)
// ============================================================================

/**
 * Connected connector interface
 */
export interface ConnectedConnector {
  connectorId: string;
  connectorUrl: string;
  hasToken: boolean;
  authType?: 'oauth' | 'api_key' | null;
  isExpired?: boolean;
  storedAt?: number;
  expiresAt?: number;
  scope?: string;
  hasKey?: boolean;
}

// ============================================================================
// Usage Types (from utils/apiHelper.ts)
// ============================================================================

/**
 * Usage quota interface
 */
export interface UsageQuota {
  userId: string;
  currentUsage: number;
  limit: number;
  remaining: number;
  percentage: number;
  hasQuota: boolean;
}

/**
 * Usage log entry interface
 */
export interface UsageLogEntry {
  userId: string;
  timestamp: number;
  requestId: string;
  modelId: string;
  requestType: string;
  inputTokens: number;
  outputTokens: number;
  normalizedCost: number;
  actualCostUSD: number;
  statusCode: number;
  agentId?: string;
  errorMessage?: string;
}

/**
 * Usage history interface
 */
export interface UsageHistory {
  userId: string;
  items: UsageLogEntry[];
  count: number;
}

/**
 * Usage by agent interface
 */
export interface UsageByAgent {
  userId: string;
  agents: Record<string, number>;
}

// ============================================================================
// Agent Settings Types (from types/global.ts)
// ============================================================================

/**
 * Tool connection status interface
 */
export interface ToolConnectionStatus {
  isConnected: boolean;
  isExpired: boolean;
}

/**
 * AI Device Data interface for agent configuration
 */
export interface AIDeviceData {
  node: ESPCDFNode;
  device: ESPCDFDevice;
  agentIdParam: ESPCDFDeviceParam | null;
  isUpdating: boolean;
}

/**
 * Agent Selection Bottom Sheet Props
 */
export interface AgentSelectionBottomSheetProps {
  /** Whether the bottom sheet is visible */
  visible: boolean;
  /** Callback when bottom sheet is closed */
  onClose: () => void;
  /** Callback when an agent is selected */
  onSelect: (agentId: string) => void;
  /** Currently selected agent ID */
  currentAgentId?: string;
}

/**
 * Agent Conversations Bottom Sheet Props
 */
export interface AgentConversationsBottomSheetProps {
  visible: boolean;
  agentId: string | null;
  onClose: () => void;
  /**
   * Called when a conversation is selected.
   * The caller is responsible for re-initialising the chat UI.
   */
  onSelectConversation: (conversation: ConversationListItem) => Promise<void> | void;
  /**
   * Whether to show and track an "active" conversation.
   * Defaults to true for chat screen usage, can be disabled in other contexts.
   */
  showActiveStatus?: boolean;
  /**
   * Whether selecting a conversation should activate it (update user data and call onSelectConversation).
   * Defaults to true for chat screen usage, can be disabled in other contexts.
   */
  allowActivation?: boolean;
}

// ============================================================================
// Style Types (from types/global.ts)
// ============================================================================

/**
 * Agent Terms Bottom Sheet Styles
 */
export interface AgentTermsBottomSheetStyles {
  backdrop: ViewStyle;
  keyboardView: ViewStyle;
  bottomSheet: ViewStyle;
  header: ViewStyle;
  title: TextStyle;
  closeButton: ViewStyle;
  handle: ViewStyle;
  content: ViewStyle;
  subtitle: TextStyle;
  inputContainer: ViewStyle;
  consentContainer: ViewStyle;
  consentTextContainer: ViewStyle;
  consentText: TextStyle;
  linkText: TextStyle;
  continueButton: ViewStyle;
}

/**
 * Agent Conversations Sheet Styles
 */
export interface AgentConversationsSheetStyles {
  backdrop: ViewStyle;
  sheetContainer: ViewStyle;
  header: ViewStyle;
  headerTitle: TextStyle;
  closeText: TextStyle;
  loadingContainer: ViewStyle;
  loadingText: TextStyle;
  emptyContainer: ViewStyle;
  emptyText: TextStyle;
  listContent: ViewStyle;
  itemContainer: ViewStyle;
  itemContainerActive: ViewStyle;
  itemTextContainer: ViewStyle;
  itemTitle: TextStyle;
  itemSubtitle: TextStyle;
  itemActions: ViewStyle;
  activeBadge: TextStyle;
  deleteButton: ViewStyle;
  deleteButtonText: TextStyle;
}

