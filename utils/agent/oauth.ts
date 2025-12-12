/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ESPOauthAdapter } from '@/adaptors/implementations/ESPOauthAdapter';
import { connectConnectorWithCode, connectConnectorWithTokens } from '@/utils/apiHelper';
import { ESPRMUser } from '@espressif/rainmaker-base-sdk';
import { CDF } from '@espressif/rainmaker-base-cdf';
import {
  AGENT_STORAGE_KEYS,
  TOKEN_STORAGE_KEYS,
} from './constants';
import type { OAuthMetadata, OAuthState } from './types';

// ==================== OAuth Utilities ====================

export function generateState(): string {
  const array = new Uint8Array(32);
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(array, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function base64UrlEncode(buffer: Uint8Array): string {
  let base64: string;

  if (typeof btoa !== 'undefined') {
    base64 = btoa(String.fromCharCode(...buffer));
  } else {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;

    while (i < buffer.length) {
      const a = buffer[i++];
      const b = i < buffer.length ? buffer[i++] : 0;
      const c = i < buffer.length ? buffer[i++] : 0;

      const bitmap = (a << 16) | (b << 8) | c;

      result += chars.charAt((bitmap >> 18) & 63);
      result += chars.charAt((bitmap >> 12) & 63);
      result += i - 2 < buffer.length ? chars.charAt((bitmap >> 6) & 63) : '=';
      result += i - 1 < buffer.length ? chars.charAt(bitmap & 63) : '=';
    }

    base64 = result;
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return base64UrlEncode(array);
}

export async function generateCodeChallenge(
  verifier: string
): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(verifier);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return base64UrlEncode(new Uint8Array(digest));
    }
    return verifier;
  } catch (error) {
    return verifier;
  }
}

export async function storeOAuthState(
  state: string,
  metadata: OAuthState
): Promise<void> {
  await AsyncStorage.setItem(
    `${AGENT_STORAGE_KEYS.OAUTH_STATE_PREFIX}${state}`,
    JSON.stringify(metadata)
  );
}

export async function getOAuthState(
  state: string
): Promise<OAuthState | null> {
  try {
    const stored = await AsyncStorage.getItem(
      `${AGENT_STORAGE_KEYS.OAUTH_STATE_PREFIX}${state}`
    );
    if (!stored) {
      return null;
    }
    return JSON.parse(stored) as OAuthState;
  } catch (error) {
    return null;
  }
}

export async function clearOAuthState(state: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(
      `${AGENT_STORAGE_KEYS.OAUTH_STATE_PREFIX}${state}`
    );
  } catch (error) {
    // Silent error handling
  }
}

export function buildAuthorizationUrl(
  config: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    clientId: string;
    redirectUri: string;
    scopes?: string[];
    resource?: string;
  },
  state: string,
  codeChallenge?: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: state,
  });

  if (config.resource) {
    params.append('resource', config.resource);
  }

  if (config.scopes && config.scopes.length > 0) {
    params.append('scope', config.scopes.join(' '));
  }

  if (codeChallenge) {
    params.append('code_challenge', codeChallenge);
    params.append('code_challenge_method', 'S256');
  }

  return `${config.authorizationEndpoint}?${params.toString()}`;
}

export async function initiateOAuthFlow(
  connectorUrl: string,
  oauthMetadata: OAuthMetadata,
  fallbackClientId: string,
  redirectUri: string,
  returnUrl?: string
): Promise<string> {
  const clientId = oauthMetadata.clientId || fallbackClientId;
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authorizationEndpoint = oauthMetadata.authorizationEndpoint;
  if (!authorizationEndpoint) {
    throw new Error('Authorization endpoint not found in OAuth metadata');
  }

  const tokenEndpoint = oauthMetadata.tokenEndpoint;
  if (!tokenEndpoint) {
    throw new Error('Token endpoint not found in OAuth metadata');
  }

  await storeOAuthState(state, {
    connectorUrl,
    codeVerifier,
    redirectUri,
    returnUrl,
    tokenEndpoint,
    resource: oauthMetadata.resource,
    clientId,
  });

  const authUrl = buildAuthorizationUrl(
    {
      authorizationEndpoint,
      tokenEndpoint,
      clientId,
      redirectUri,
      scopes: oauthMetadata.scopesSupported,
      resource: oauthMetadata.resource,
    },
    state,
    codeChallenge
  );

  return authUrl;
}

export async function completeOAuthFlow(
  code: string,
  state: string
): Promise<{ message: string; connectorUrl: string }> {
  const oauthState = await getOAuthState(state);
  if (!oauthState) {
    throw new Error('OAuth state not found or expired');
  }

  const result = await connectConnectorWithCode({
    connectorUrl: oauthState.connectorUrl,
    tokenEndpoint: oauthState.tokenEndpoint || '',
    code: code,
    clientId: oauthState.clientId || '',
    redirectUri: oauthState.redirectUri,
    codeVerifier: oauthState.codeVerifier,
    resource: oauthState.resource,
  });

  await clearOAuthState(state);

  return result;
}

export async function connectToolWithOAuth(
  toolUrl: string,
  oauthMetadata: OAuthMetadata,
  redirectUri: string,
  fallbackClientId: string = 'default_client_id'
): Promise<{ message: string; connectorUrl: string }> {
  try {
    const authUrl = await initiateOAuthFlow(
      toolUrl,
      oauthMetadata,
      fallbackClientId,
      redirectUri
    );

    const urlParams = new URLSearchParams(authUrl.split('?')[1]);
    const state = urlParams.get('state');

    if (!state) {
      throw new Error('State parameter not found in authorization URL');
    }

    await AsyncStorage.setItem(AGENT_STORAGE_KEYS.CURRENT_OAUTH_STATE, state);

    const espOauthAdapter = new ESPOauthAdapter();
    const code = await espOauthAdapter.getOauthCode(authUrl);

    const storedState = await AsyncStorage.getItem(
      AGENT_STORAGE_KEYS.CURRENT_OAUTH_STATE
    );
    if (!storedState || storedState !== state) {
      throw new Error('OAuth state mismatch');
    }

    const result = await completeOAuthFlow(code, state);

    await AsyncStorage.removeItem(AGENT_STORAGE_KEYS.CURRENT_OAUTH_STATE);

    return result;
  } catch (error) {
    await AsyncStorage.removeItem(AGENT_STORAGE_KEYS.CURRENT_OAUTH_STATE).catch(
      () => {}
    );
    throw error;
  }
}

function decodeJWT(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');

    while (base64.length % 4) {
      base64 += '=';
    }

    let decoded: string;
    if (typeof atob !== 'undefined') {
      decoded = atob(base64);
    } else {
      const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;

      while (i < base64.length) {
        const encoded1 = chars.indexOf(base64.charAt(i++));
        const encoded2 = chars.indexOf(base64.charAt(i++));
        const encoded3 = chars.indexOf(base64.charAt(i++));
        const encoded4 = chars.indexOf(base64.charAt(i++));

        const bitmap =
          (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;

        result += String.fromCharCode((bitmap >> 16) & 255);
        if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
        if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255);
      }
      decoded = result;
    }

    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
}

export async function connectToolWithTokens(
  store: CDF,
  connectorUrl: string,
  oauthMetadata?: {
    tokenEndpoint?: string;
    clientId?: string;
    resource?: string;
  }
): Promise<{ message: string; connectorUrl: string }> {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  try {
    accessToken = await ESPRMUser.getAccessToken();
  } catch (error) {
    accessToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN);
  }

  refreshToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN);

  if (!accessToken) {
    throw new Error('Access token not found. Please login again.');
  }

  if (!refreshToken) {
    throw new Error('Refresh token not found. Please login again.');
  }

  let expiresAt: number | undefined;
  const decodedToken = decodeJWT(accessToken);
  if (decodedToken && decodedToken.exp) {
    expiresAt = decodedToken.exp - 10;
  }

  return await connectConnectorWithTokens({
    connectorUrl,
    accessToken,
    refreshToken,
    expiresAt,
    tokenType: 'Bearer',
    scope: 'email',
    tokenEndpoint: oauthMetadata?.tokenEndpoint,
    clientId: oauthMetadata?.clientId,
    resource: oauthMetadata?.resource,
    authType: 'oauth',
  });
}


