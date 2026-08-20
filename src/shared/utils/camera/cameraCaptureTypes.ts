/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for camera jpeg-capture cmd-resp (control panel + agent tools).
 */

/**
 * A single `jpeg-capture` argument: flag/value string (`"--upload"`, `"30"`)
 * or a structured value such as a `[width, height]` resolution pair.
 */
export type CameraCaptureCmdArg = string | number[];

/** Payload sent with a camera jpeg-capture cmd-resp request. */
export interface CameraCaptureCmdData {
  cmd: string;
  args: CameraCaptureCmdArg[];
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

/** Snapshot the device captured and uploaded straight into an agent conversation. */
export interface CapturedSnapshot {
  /** Agent media id of the uploaded snapshot. */
  mediaId: string;
  /** S3 key the device uploaded the snapshot to. */
  s3Key: string;
  /** File name reported by the device. */
  filename: string;
  /** Byte size, when the device reports it (`size_bytes`/`size`). */
  sizeBytes?: number;
}
