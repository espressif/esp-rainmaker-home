/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Control feature types. Camera cmd-resp shapes live in shared; re-exported
 * here so control hooks keep importing from `@features/control/types`.
 */

export type {
  CameraCaptureCmdArg,
  CameraCaptureCmdData,
  CmdRespSendResult,
  CmdRespRequestStatus,
  CmdRespTerminalResult,
  CapturedSnapshot,
} from "@shared/utils/camera/cameraCaptureTypes";

/** Return shape of `useCameraCommand`. */
export interface UseCameraCommandReturn {
  /** True while a capture command is in flight (sending + polling). */
  capturing: boolean;
  /** Triggers a JPEG snapshot capture on the device and reports the outcome via toast. */
  captureSnapshot: () => Promise<void>;
}
