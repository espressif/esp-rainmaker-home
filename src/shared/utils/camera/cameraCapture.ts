/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared camera jpeg-capture helpers used by the control panel and agent
 * local tools. Sends cmd-resp and polls until a terminal status.
 */

import { Buffer } from "buffer";
import type { ESPCDFUser } from "@store";
import { pollUntilReady } from "@shared/utils/common";
import {
  CAMERA_SNAPSHOT_COMMAND_ID,
  CAMERA_CMD_JPEG_CAPTURE,
  NODE_CMD_DEFAULT_TIMEOUT,
  NODE_CMD_POLL_INTERVAL_MS,
  NODE_CMD_POLL_MAX_ATTEMPTS,
  NODE_CMD_POLL_LABEL_SNAPSHOT,
  NODE_CMD_STATUS_SUCCESS,
  NODE_CMD_STATUS_FAILURE,
  NODE_CMD_STATUS_TIMED_OUT,
  SNAPSHOT_SIZE_MB_THRESHOLD,
} from "@shared/utils/constants";
import type {
  CameraCaptureCmdArg,
  CameraCaptureCmdData,
  CapturedSnapshot,
  CmdRespSendResult,
  CmdRespRequestStatus,
  CmdRespTerminalResult,
} from "@shared/utils/camera/cameraCaptureTypes";

/**
 * Formats a byte count as a human-readable size (KB, or MB above the threshold).
 * @param bytes - Size in bytes.
 * @returns A short size string, or empty when not a finite number.
 */
export function formatSize(bytes: unknown): string {
  const n = typeof bytes === "number" ? bytes : Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= SNAPSHOT_SIZE_MB_THRESHOLD) {
    return `${(n / SNAPSHOT_SIZE_MB_THRESHOLD).toFixed(1)} MB`;
  }
  return `${Math.round(n / 1024)} KB`;
}

/**
 * Builds the toast subtitle (`<name> · <size>`) from the device response_data,
 * tolerating a bare `name` or a full `file` path and an optional `size`.
 * @param responseData - The device's `response_data` payload.
 * @returns A subtitle string, or undefined when no name is present.
 */
export function captureDetail(responseData: unknown): string | undefined {
  const rd = (responseData ?? {}) as Record<string, unknown>;
  const raw = (rd.name ?? rd.file) as string | undefined;
  if (!raw) return undefined;
  const name = raw.split("/").pop() || raw;
  const size = formatSize(rd.size);
  return size ? `${name} · ${size}` : name;
}

/**
 * Normalizes a device `responseData` payload into an object. The cmd-resp
 * payload may arrive as an object, a JSON string, or a base64-encoded JSON
 * string. Tolerates all three; returns `{}` when it can't be parsed.
 * @param raw - The raw `responseData` from the status response.
 * @returns The decoded payload as a plain object.
 */
export function decodeResponseData(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  const text = String(raw);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // not plain JSON — fall through to base64
  }
  try {
    const decoded = Buffer.from(text, "base64").toString("utf-8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Sends a camera `jpeg-capture` cmd-resp request and polls until it reaches a
 * terminal status. Same CDF path used by the Camera control panel
 * (`useCameraCommand`); callers vary only the capture args (and optionally
 * `cmdId`).
 * @param user - Authenticated CDF user (cmd-resp APIs).
 * @param nodeId - Target camera node id.
 * @param args - `jpeg-capture` args (`--upload`, `--agent-id`, …).
 * @param cmdId - Framework command id (defaults to {@link CAMERA_SNAPSHOT_COMMAND_ID}).
 * @returns Terminal status + optional device `responseData`.
 * @throws If the create request returns no `requestId`, or polling exhausts
 *   without a terminal status.
 */
export async function runCameraJpegCapture(
  user: ESPCDFUser,
  nodeId: string,
  args: CameraCaptureCmdArg[],
  cmdId: number = CAMERA_SNAPSHOT_COMMAND_ID,
): Promise<CmdRespTerminalResult> {
  const data: CameraCaptureCmdData = {
    cmd: CAMERA_CMD_JPEG_CAPTURE,
    args,
  };

  // CDF types `T` as both params and return; cast the SDK send result.
  const send = (await user.createCmdRespRequest({
    nodeIds: [nodeId],
    cmdId,
    timeoutSeconds: NODE_CMD_DEFAULT_TIMEOUT,
    data,
  })) as unknown as CmdRespSendResult;

  if (!send.requestId) {
    throw new Error("Command request returned no request_id");
  }

  const pollResult = await pollUntilReady<CmdRespTerminalResult>(
    async () => {
      const requests = await user.getCmdRespRequestById<CmdRespRequestStatus[]>(
        send.requestId,
        nodeId,
      );
      const first = Array.isArray(requests) ? requests[0] : undefined;
      const status = first?.status ?? "";

      if (
        status === NODE_CMD_STATUS_SUCCESS ||
        status === NODE_CMD_STATUS_FAILURE ||
        status === NODE_CMD_STATUS_TIMED_OUT
      ) {
        return {
          status,
          responseData: first?.responseData,
        };
      }
      return null;
    },
    {
      maxAttempts: NODE_CMD_POLL_MAX_ATTEMPTS,
      intervalMs: NODE_CMD_POLL_INTERVAL_MS,
      label: NODE_CMD_POLL_LABEL_SNAPSHOT,
      enableLogging: __DEV__,
    },
  );

  if (!pollResult.success || !pollResult.data) {
    throw new Error("Timed out waiting for the snapshot capture to complete");
  }

  return pollResult.data;
}

/**
 * Parses a successful agent-targeted capture response into media metadata.
 * @param responseData - Device `responseData` from a terminal success result.
 * @returns Media id, S3 key, filename, and optional size.
 * @throws If `media_id` / `s3_key` are missing.
 */
export function parseAgentCaptureResponse(
  responseData: unknown,
): CapturedSnapshot {
  const rd = decodeResponseData(responseData);
  const mediaId = String(rd.media_id ?? rd.mediaId ?? "");
  const s3Key = String(rd.s3_key ?? rd.s3Key ?? "");
  const filename = String(rd.name ?? rd.filename ?? "");
  if (!mediaId || !s3Key) {
    throw new Error(
      "Capture succeeded but the device response is missing media_id/s3_key",
    );
  }

  const sizeBytes = Number(rd.size_bytes ?? rd.sizeBytes ?? rd.size);
  return {
    mediaId,
    s3Key,
    filename,
    ...(Number.isFinite(sizeBytes) && sizeBytes > 0 ? { sizeBytes } : {}),
  };
}
