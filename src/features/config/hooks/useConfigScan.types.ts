/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConfigScanPhase } from "@src/types/global";

/**
 * Config-scan lifecycle shared by the web paste/upload flow.
 */
export interface UseConfigScanBaseReturn {
  phase: ConfigScanPhase;
  errorMessage: string;
  showScanner: boolean;
  setShowScanner: (show: boolean) => void;
  handleScan: (scannedValue: string) => Promise<void>;
  handleRetry: () => void;
  handleUpdateConfig: () => void;
  handleCancel: () => void;
  handleBackFromScanner: () => void;
  /** Display label (base URL) of the remembered deployment, else null. */
  savedDeploymentLabel: string | null;
  handleContinueWithSaved: () => Promise<void>;
}

/**
 * Native config-scan hook surface, including camera permission.
 * `handleScan` returns whether the payload was accepted so the scanner can
 * freeze and show Scan Again on failure (same pattern as provision ScanQR).
 */
export interface UseConfigScanReturn {
  phase: ConfigScanPhase;
  showScanner: boolean;
  setShowScanner: (show: boolean) => void;
  permission: { granted: boolean } | null;
  requestPermission: () => void;
  handleScan: (scannedValue: string) => Promise<boolean>;
  handleUpdateConfig: () => void;
  handleCancel: () => void;
  handleBackFromScanner: () => void;
  /** Display label (base URL) of the remembered deployment, else null. */
  savedDeploymentLabel: string | null;
  handleContinueWithSaved: () => Promise<void>;
}
