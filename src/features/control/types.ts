/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Payload sent with a camera jpeg-capture cmd-resp request. */
export interface CameraCaptureCmdData {
  cmd: string;
  args: string[];
}

/** Structural shape of the SDK createCmdRespRequest response (via CDF `T`). */
export interface CmdRespSendResult {
  requestId: string;
}

/** Structural shape of one SDK ESPCmdRespRequest (via CDF `T`). */
export interface CmdRespRequestStatus {
  status: string;
  responseData?: unknown;
}

/** Terminal cmd-resp outcome returned once polling reaches success/failure/timeout. */
export interface CmdRespTerminalResult {
  status: string;
  responseData?: unknown;
}

/** Return shape of `useCameraCommand`. */
export interface UseCameraCommandReturn {
  /** True while a capture command is in flight (sending + polling). */
  capturing: boolean;
  /** Triggers a JPEG snapshot capture on the device and reports the outcome via toast. */
  captureSnapshot: () => Promise<void>;
}
