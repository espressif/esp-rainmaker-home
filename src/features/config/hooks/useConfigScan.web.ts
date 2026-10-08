/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConfigScanShared } from "./useConfigScanShared";
import type { UseConfigScanBaseReturn } from "./useConfigScan.types";

export type { UseConfigScanBaseReturn as UseConfigScanReturn } from "./useConfigScan.types";

/**
 * Web config-scan hook: shared apply lifecycle without camera permission.
 * Native builds resolve `useConfigScan.ts` instead.
 * @returns Scan phase and handlers for paste / upload / JSON input
 */
export function useConfigScan(): UseConfigScanBaseReturn {
  return useConfigScanShared();
}
