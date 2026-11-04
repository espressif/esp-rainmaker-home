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
  /** True while `getOauthCode` waits for the browser redirect. */
  private waitingForBrowser = false;

  /**
   * Whether the browser is open and no redirect has come back yet.
   * @returns True while `getOauthCode` is waiting.
   */
  isWaitingForBrowser(): boolean {
    return this.waitingForBrowser;
  }

  /**
   * Clears the wait for a request that was given up. The native module keeps
   * only the newest request, so the old promise may never settle.
   */
  stopWaitingForBrowser(): void {
    this.waitingForBrowser = false;
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
    this.waitingForBrowser = true;
    try {
      // Call the native module which handles everything:
      // 1. Opens the URL in browser
      // 2. Waits for deep link redirect
      // 3. Extracts auth code from redirect
      // 4. Returns the auth code or throws error
      return await ESPOauthModule.getOauthCode(requestURL);
    } catch (error) {
      console.error("OAuth flow failed:", error);

      // Re-throw with more context if needed
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(`OAuth flow failed: ${String(error)}`);
      }
    } finally {
      this.waitingForBrowser = false;
    }
  }
}

// Export a singleton instance for convenience
export const espOauthAdapter = new ESPOauthAdapter();
