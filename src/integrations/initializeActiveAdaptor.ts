/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StartupError } from "@shared/utils/startupError";

/**
 * Sets up the SDK adaptor this session uses. Only a {@link StartupError}
 * stops app start (the start screen then offers Retry); any other failure is
 * logged and the app carries on.
 * @param adaptor - The active SDK adaptor.
 */
export async function initializeActiveAdaptor(adaptor: {
  initializeSDK(): Promise<unknown>;
}): Promise<void> {
  try {
    await adaptor.initializeSDK();
  } catch (error) {
    if (error instanceof StartupError) throw error;
    console.error("[CDFBootstrap] Failed to initialize active SDK:", error);
  }
}
