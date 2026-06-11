/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import ESPOauthModule from "../interfaces/ESPOauthInterface";

/**
 * ESPOauthAdapter provides OAuth authentication functionality for React Native applications.
 * This adapter handles the complete OAuth flow using native Android code including:
 * - Opening OAuth authorization URLs in the native browser
 * - Handling deep link redirects directly on the Android side
 * - Extracting authorization codes from redirect URLs
 * - Promise-based API for easy integration
 * - No dependency on React Native's Linking API
 */
export class ESPOauthAdapter {
  /** True once the current attempt's authorization code has been received. */
  private authCodeReceived = false;

  /**
   * Whether the in-flight OAuth attempt has already received its authorization
   * code from the browser redirect — i.e. the browser leg is complete and only
   * the token exchange remains. Used by the login flow's browser-abandon
   * watchdog to avoid cancelling an attempt that is past the browser phase.
   * Reset at the start of each `getOauthCode` call.
   */
  hasReceivedAuthCode(): boolean {
    return this.authCodeReceived;
  }

  /**
   * Initiates the OAuth authorization flow.
   *
   * This method opens the OAuth authorization URL in the default browser
   * and waits for the deep link redirect to be handled by the native Android code.
   * The authorization code is extracted and returned directly.
   * @param requestURL The OAuth authorization URL to open
   * @returns Promise that resolves with the authorization code
   * @throws Error if the OAuth flow fails or times out
   */
  async getOauthCode(requestURL: string): Promise<string> {
    this.authCodeReceived = false;
    try {
      // Call the native module which handles everything:
      // 1. Opens the URL in browser
      // 2. Waits for deep link redirect
      // 3. Extracts auth code from redirect
      // 4. Returns the auth code or throws error
      const authCode = await ESPOauthModule.getOauthCode(requestURL);
      this.authCodeReceived = true;
      return authCode;
    } catch (error) {
      console.error("OAuth flow failed:", error);

      // Re-throw with more context if needed
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(`OAuth flow failed: ${String(error)}`);
      }
    }
  }
}

// Export a singleton instance for convenience
export const espOauthAdapter = new ESPOauthAdapter();
