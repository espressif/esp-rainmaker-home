/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AGENTS_API_BASE_URL } from '@/config/agent.config';
import { ESPRMUser } from '@espressif/rainmaker-base-sdk';
import { TOKEN_STORAGE_KEYS } from './agent';
import type {
    Agent,
    UserProfile,
    ConnectedConnector,
    UsageQuota,
    UsageHistory,
    UsageByAgent,
    Conversation,
    ConversationListItem,
} from '@/utils/agent/types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiRequestConfig {
    path: string;
    method?: HttpMethod;
    body?: any;
    headers?: Record<string, string>;
    params?: Record<string, any>;
}

/**
 * Create an axios instance with default configuration
 */
const createAxiosInstance = (): AxiosInstance => {
    const instance = axios.create({
        baseURL: AGENTS_API_BASE_URL,
        timeout: 30000, // 30 seconds
        headers: {
            'Content-Type': 'application/json',
        },
    });

    // Add response interceptor for error handling
    instance.interceptors.response.use(
        (response: AxiosResponse) => response,
        (error: any) => {
            return Promise.reject(error);
        }
    );

    return instance;
};

const axiosInstance = createAxiosInstance();

/**
 * Generic API helper function to make HTTP requests
 * Authorization Bearer token is added directly to each request
 * The token is fetched from AsyncStorage.getItem('com.esprmbase.accessToken')
 * @param config - API request configuration
 * @returns Promise with the response data
 */
export const apiRequest = async <T = any>(
    config: ApiRequestConfig
): Promise<T> => {
    const {
        path,
        method = 'GET',
        body,
        headers = {},
        params,
    } = config;

    // Fetch token from AsyncStorage and add to headers
    let authToken: string | null = null;
    try {
        authToken = await ESPRMUser.getAccessToken();
    } catch (error) {
        authToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN);
    }

    const requestConfig: AxiosRequestConfig = {
        method,
        url: path,
        headers: {
            ...axiosInstance.defaults.headers.common,
            ...headers,
            // Add Authorization header directly if token exists
            ...(authToken && { Authorization: `Bearer ${authToken}` }),
        },
        params,
    };

    // Add body for methods that support it
    if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        requestConfig.data = body;
    }

    try {
        const response: AxiosResponse<T> = await axiosInstance.request(requestConfig);
        return response.data;
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            throw {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
            };
        }
        throw error;
    }
};

/**
 * Get agent configuration
 * Authorization Bearer token is added directly via apiRequest()
 * The token is fetched from AsyncStorage.getItem('com.esprmbase.accessToken')
 * @param agentId - The agent ID
 * @returns Promise with the agent configuration
 */
export const getAgentConfig = async (agentId: string): Promise<any> => {
    if (!agentId || typeof agentId !== 'string') {
        throw new Error('Agent ID is required and must be a string');
    }

    // Trim and validate agentId
    const trimmedAgentId = agentId.trim();
    
    if (!trimmedAgentId || trimmedAgentId === '') {
        throw new Error('Agent ID cannot be empty');
    }

    // URL encode the agentId to handle special characters
    const encodedAgentId = encodeURIComponent(trimmedAgentId);

    // Uses apiRequest() which adds Authorization header directly
    try {
        const result = await apiRequest({
            path: `/user/agents/${encodedAgentId}/config`,
            method: 'GET',
        });
        return result;
    } catch (error: any) {
        throw error;
    }
};

// ==================== Type Definitions ====================

// Re-export all agent-related types from utils/agent/types for backward compatibility
export type {
    Agent,
    UserProfile,
    ConnectedConnector,
    UsageQuota,
    UsageLogEntry,
    UsageHistory,
    UsageByAgent,
    ConversationMessage,
    Conversation,
    ConversationListItem,
} from '@/utils/agent/types';

// ==================== User Profile APIs ====================

/**
 * Get current user profile
 */
export async function getUserProfile(): Promise<UserProfile> {
    return apiRequest<UserProfile>({
        path: '/user/profile',
        method: 'GET',
    });
}

/**
 * Create or update user profile
 */
export async function updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    return apiRequest<UserProfile>({
        path: '/user/profile',
        method: 'POST',
        body: profile,
    });
}

// ==================== Connector APIs ====================

/**
 * Get list of connected connectors
 * Matches: GET /user/connectors
 * Headers: Authorization: Bearer <token>, Accept: application/json
 * Authorization Bearer token is added directly via apiRequest()
 * The token is fetched from AsyncStorage.getItem('com.esprmbase.accessToken')
 */
export async function getConnectedConnectors(): Promise<ConnectedConnector[]> {
    const response = await apiRequest<{ connectors?: ConnectedConnector[] } | ConnectedConnector[]>({
        path: '/user/connectors',
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/plain, */*',
        },
    });

    // API returns {connectors: [...]} but we need just the array
    if (Array.isArray(response)) {
        return response;
    }
    return (response as any).connectors || [];
}

/**
 * Get OAuth authorization URL for a connector
 * This URL should be opened in a browser to initiate OAuth flow
 * Authorization Bearer token is added directly via apiRequest()
 * The token is fetched from AsyncStorage.getItem('com.esprmbase.accessToken')
 */
export async function getConnectorAuthorizationUrl(params: {
    connectorUrl: string;
    redirectUri: string;
    clientId?: string;
    scope?: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
}): Promise<{ authorizationUrl: string }> {
    return apiRequest<{ authorizationUrl: string }>({
        path: '/user/connectors/authorize',
        method: 'GET',
        params: {
            connectorUrl: params.connectorUrl,
            redirectUri: params.redirectUri,
            clientId: params.clientId,
            scope: params.scope,
            state: params.state,
            codeChallenge: params.codeChallenge,
            codeChallengeMethod: params.codeChallengeMethod,
        },
    });
}

/**
 * Connect a new connector
 */
export async function connectConnector(
    connectorType: string,
    credentials: Record<string, any>
): Promise<{ success: boolean; message?: string }> {
    return apiRequest<{ success: boolean; message?: string }>({
        path: '/user/connectors',
        method: 'POST',
        body: { connectorType, credentials },
    });
}

/**
 * Disconnect a connector
 */
export async function disconnectConnector(
    connectorUrl: string,
    clientId?: string,
    authType?: string
): Promise<{ success: boolean; message?: string }> {
    const body: { connectorUrl: string; clientId?: string; authType?: string } = {
        connectorUrl,
    };
    
    // Add clientId and authType if provided
    if (clientId) {
        body.clientId = clientId;
    }
    if (authType) {
        body.authType = authType;
    }
    
    return apiRequest<{ success: boolean; message?: string }>({
        path: '/user/connectors',
        method: 'DELETE',
        body,
    });
}

/**
 * Connect a connector by exchanging OAuth code for tokens and storing them.
 * Backend handles token exchange and storage in one call (no CORS issues).
 * Matches: POST /user/connectors?exchange_token=true
 */
export async function connectConnectorWithCode(params: {
    connectorUrl: string;
    tokenEndpoint: string;
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier?: string;
    resource?: string;
}): Promise<{ message: string; connectorUrl: string }> {

    return apiRequest<{ message: string; connectorUrl: string }>({
        path: '/user/connectors',
        method: 'POST',
        params: { exchange_token: 'true' },
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
        },
        body: {
            connectorUrl: params.connectorUrl,
            tokenEndpoint: params.tokenEndpoint,
            code: params.code,
            clientId: params.clientId,
            redirectUri: params.redirectUri,
            codeVerifier: params.codeVerifier,
            resource: params.resource,
            authType: 'oauth',
        },
    });
}

/**
 * Connect a connector with API key authentication
 */
export async function connectConnectorWithApiKey(
    connectorUrl: string,
    apiKey: string
): Promise<{ message: string; connectorUrl: string }> {
    return apiRequest<{ message: string; connectorUrl: string }>({
        path: '/user/connectors',
        method: 'POST',
        body: {
            connectorUrl,
            apiKey,
            authType: 'api_key',
        },
    });
}

/**
 * Store OAuth tokens for a connector (called if you already have tokens)
 */
export async function storeOAuthToken(
    connectorUrl: string,
    accessToken: string,
    refreshToken?: string,
    expiresAt?: number,
    tokenType?: string,
    scope?: string
): Promise<{ message: string; connectorUrl: string }> {
    return apiRequest<{ message: string; connectorUrl: string }>({
        path: '/user/connectors',
        method: 'POST',
        body: {
            connectorUrl,
            accessToken,
            refreshToken,
            expiresAt,
            tokenType: tokenType || 'Bearer',
            scope,
        },
    });
}

/**
 * Connect a connector with tokens directly (without OAuth exchange)
 * Used for connectors that don't require OAuth flow, like MCP connector
 * Sets exchange=false to skip token exchange
 */
export async function connectConnectorWithTokens(params: {
    connectorUrl: string;
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
    tokenType?: string;
    scope?: string;
    tokenEndpoint?: string;
    clientId?: string;
    resource?: string;
    authType?: string;
}): Promise<{ message: string; connectorUrl: string }> {
    const body: any = {
        connectorUrl: params.connectorUrl,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
    };

    // Add optional parameters if provided
    if (params.expiresAt !== undefined) {
        body.expiresAt = params.expiresAt;
    }
    if (params.tokenType) {
        body.tokenType = params.tokenType;
    }
    if (params.scope) {
        body.scope = params.scope;
    }
    if (params.tokenEndpoint) {
        body.tokenEndpoint = params.tokenEndpoint;
    }
    if (params.clientId) {
        body.clientId = params.clientId;
    }
    if (params.resource) {
        body.resource = params.resource;
    }
    if (params.authType) {
        body.authType = params.authType;
    }

    return apiRequest<{ message: string; connectorUrl: string }>({
        path: '/user/connectors',
        method: 'POST',
        params: { exchange: 'false' },
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
        },
        body,
    });
}

// ==================== Agent APIs ====================

/**
 * Get list of agents created by the current user
 */
export async function getUserAgents(): Promise<Agent[]> {
    const response = await apiRequest<{ agents?: Agent[] } | Agent[]>({
        path: '/user/agents',
        method: 'GET',
    });

    if (Array.isArray(response)) {
        return response;
    }
    return (response as any).agents || [];
}

/**
 * Get list of template agents (common agents)
 */
export async function getTemplateAgents(): Promise<Agent[]> {
    const response = await apiRequest<{ agents?: Agent[] } | Agent[]>({
        path: '/user/agents/templates',
        method: 'GET',
    });

    if (Array.isArray(response)) {
        return response;
    }
    return (response as any).agents || [];
}

// ==================== Usage & Quota APIs ====================

/**
 * Get current 24h usage and quota
 */
export async function getCurrentUsage(): Promise<UsageQuota> {
    return apiRequest<UsageQuota>({
        path: '/user/usage/current',
        method: 'GET',
    });
}

/**
 * Get detailed usage history
 */
export async function getUsageHistory(
    startTime?: number,
    endTime?: number,
    limit: number = 100
): Promise<UsageHistory> {
    const params: Record<string, string> = {
        limit: limit.toString(),
    };

    if (startTime) {
        params.start_time = startTime.toString();
    }
    if (endTime) {
        params.end_time = endTime.toString();
    }

    return apiRequest<UsageHistory>({
        path: '/user/usage/history',
        method: 'GET',
        params,
    });
}

/**
 * Get usage breakdown by agent
 */
export async function getUsageByAgent(): Promise<UsageByAgent> {
    return apiRequest<UsageByAgent>({
        path: '/user/usage/by-agents',
        method: 'GET',
    });
}

// ==================== Conversation APIs ====================

/**
 * List conversations for an agent
 */
export async function listConversations(agentId: string): Promise<ConversationListItem[]> {
    const response = await apiRequest<{ conversations?: any[] } | any[]>({
        path: `/user/agents/${agentId}/conversations`,
        method: 'GET',
    });

    const rawItems: any[] = Array.isArray(response)
        ? response
        : (response as any).conversations || [];

    // Normalise fields in case backend returns them as strings
    return rawItems.map((item) => ({
        conversationId: item.conversationId,
        title: item.title,
        agentId: item.agentId,
        createdAt: typeof item.createdAt === 'string' ? Number(item.createdAt) : item.createdAt,
        updatedAt: typeof item.updatedAt === 'string' ? Number(item.updatedAt) : item.updatedAt,
        messageCount:
            typeof item.messageCount === 'string'
                ? Number(item.messageCount)
                : item.messageCount,
    })) as ConversationListItem[];
}

/**
 * Get a specific conversation with full history
 */
export async function getConversation(conversationId: string): Promise<Conversation> {
    return apiRequest<Conversation>({
        path: `/user/conversation/${conversationId}`,
        method: 'GET',
    });
}

/**
 * Get a conversation by agentId and conversationId
 */
export async function getConversationByAgent(
    agentId: string,
    conversationId: string
): Promise<Conversation> {
    return apiRequest<Conversation>({
        path: `/user/agents/${agentId}/conversations/${conversationId}`,
        method: 'GET',
    });
}

/**
 * Create a new conversation
 */
export async function createConversation(
    agentId: string,
    firstMessage?: string,
    title?: string
): Promise<{ conversationId: string; title: string; createdAt: number; agentId: string }> {
    return apiRequest<{ conversationId: string; title: string; createdAt: number; agentId: string }>({
        path: `/user/agents/${agentId}/conversations`,
        method: 'POST',
        body: {
            message: firstMessage || '',
            title,
        },
    });
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>({
        path: `/user/conversation/${conversationId}`,
        method: 'DELETE',
    });
}

/**
 * Delete a conversation by agentId and conversationId
 */
export async function deleteConversationByAgent(
    agentId: string,
    conversationId: string
): Promise<{ message: string }> {
    return apiRequest<{ message: string }>({
        path: `/user/agents/${agentId}/conversations/${conversationId}`,
        method: 'DELETE',
    });
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
    conversationId: string,
    title: string
): Promise<{ conversationId: string; title: string }> {
    return apiRequest<{ conversationId: string; title: string }>({
        path: `/user/conversation/${conversationId}/title`,
        method: 'PUT',
        body: { title },
    });
}

/**
 * Generate a title for a conversation using system_title_generator
 */
export async function generateConversationTitle(message: string): Promise<string> {
    try {
        const response = await apiRequest<{ reply?: string }>({
            path: '/user/chat/system_title_generator',
            method: 'POST',
            body: { message },
        });
        return response.reply || 'New Conversation';
    } catch (error) {
        return 'New Conversation';
    }
}

/**
 * Send an event message to an agent
 */
export async function sendEventMessage(agentId: string, message: string): Promise<string> {
    const response = await apiRequest<{ reply?: string }>({
        path: `/user/chat/${agentId}`,
        method: 'POST',
        body: { message },
    });
    return response.reply || 'Event processed successfully';
}
