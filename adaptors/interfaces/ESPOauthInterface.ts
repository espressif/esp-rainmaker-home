/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";

const { ESPOauthModule } = NativeModules;

interface ESPOauthInterface {
  /**
   * Gets the OAuth code from the ESP OAuth module.
   * @param url - The URL to get the OAuth code from.
   * @returns Promise<string> - The OAuth code.
   */
  getOauthCode(url: string): Promise<string>;
}

export default ESPOauthModule as ESPOauthInterface;
