/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Export all types
export type {
  AgentConfig,
  AgentConfigResponse,
  MessageDisplayConfig,
  WebSocketMessage,
  OAuthMetadata,
  OAuthState,
  ConversationData,
  FontSizeLevel,
  AggregatedAgent,
  AgentValidationResult,
  AgentSource,
} from './types';

// Export all constants
export * from './constants';

// Export storage functions
export {
  getAgents,
  saveAgents,
  getSelectedAgentId,
  saveSelectedAgent,
  getAgentsAndSelectedId,
  hasAgentsConfigured,
  getMessageDisplayConfig,
  saveMessageDisplayConfig,
  getChatFontSize,
  saveChatFontSize,
  getConversationId,
  saveConversationId,
  deleteConversationId,
  isConversationExpired,
} from './storage';

// Export API functions
export {
  getAgentConfig,
  getWebSocketUrl,
  getAgentConfigFromCache,
  saveAgentConfigToCache,
  getAgentNameFromCache,
  getToolConnectionStatus,
} from './api';

// Export OAuth functions
export {
  connectToolWithOAuth,
  connectToolWithTokens,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  initiateOAuthFlow,
  completeOAuthFlow,
} from './oauth';

// Export device functions
export {
  isAIAssistantDevice,
  filterAIAssistantDevices,
  getDeviceKey,
  findAgentIdParam,
  getCurrentAgentId,
  updateRefreshTokensForAllAIDevices,
  setUserAuthForNode,
} from './device';

// Export aggregation functions
export {
  getAllAgents,
  validateAgent,
  removeInvalidAgentFromCustomData,
} from './aggregation';

