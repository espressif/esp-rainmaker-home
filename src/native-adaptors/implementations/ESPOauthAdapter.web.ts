/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { rejectWebUnsupported } from "@native-adaptors/utils/webPlatform";

/** OAuth adaptor stub for web — native deep-link flow is unavailable */
export class ESPOauthAdapter {
  async getOauthCode(_requestURL: string): Promise<string> {
    return rejectWebUnsupported("native OAuth");
  }
}

export const espOauthAdapter = new ESPOauthAdapter();
