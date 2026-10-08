/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { rejectWebUnsupported } from "@native-adaptors/utils/webPlatform";

/**
 * WeChat login is native-only (CN). Always false on web.
 * @returns Whether a WeChat auth code was received
 */
export function hasReceivedWeChatAuthCode(): boolean {
  return false;
}

/**
 * WeChat login gate for web — native WeChat SDK is unavailable in the browser.
 * @throws Web-unsupported error
 */
export async function performWeChatLogin(): Promise<void> {
  return rejectWebUnsupported("WeChat login");
}
