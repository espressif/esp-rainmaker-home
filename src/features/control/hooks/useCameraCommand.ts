/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

// Hooks
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";

// Utils
import { pollUntilReady } from "@shared/utils/common";
import { captureDetail } from "../utils/cameraHelpers";

// Constants
import {
  CAMERA_CMD_JPEG_CAPTURE,
  CAMERA_CMD_ARG_UPLOAD,
  CAMERA_SNAPSHOT_COMMAND_ID,
  NODE_CMD_DEFAULT_TIMEOUT,
  NODE_CMD_POLL_INTERVAL_MS,
  NODE_CMD_POLL_MAX_ATTEMPTS,
  NODE_CMD_POLL_LABEL_SNAPSHOT,
  NODE_CMD_STATUS_SUCCESS,
  NODE_CMD_STATUS_FAILURE,
  NODE_CMD_STATUS_TIMED_OUT,
} from "../constants";

// Types
import type {
  CameraCaptureCmdData,
  CmdRespSendResult,
  CmdRespRequestStatus,
  CmdRespTerminalResult,
  UseCameraCommandReturn,
} from "../types";

const LOG_PREFIX = "[useCameraCommand]";

/**
 * Hook to trigger a device-side JPEG snapshot capture via the CDF
 * command-response flow (send `jpeg-capture`, then poll until the request
 * reaches a terminal status). Surfaces success/failure through the toast.
 * @param nodeId - The camera node id to capture from.
 * @returns The capture handler and its in-flight state.
 */
export const useCameraCommand = (nodeId: string): UseCameraCommandReturn => {
  const { t } = useTranslation();
  const { espCDFUser } = useCDF();
  const toast = useToast();
  const [capturing, setCapturing] = useState(false);

  const captureSnapshot = useCallback(async (): Promise<void> => {
    if (capturing) {
      if (__DEV__) {
        console.log(`${LOG_PREFIX} skip: capture already in flight`, { nodeId });
      }
      return;
    }
    if (!espCDFUser) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} abort: no CDF user`, { nodeId });
      }
      toast.showError(t("device.camera.capture.failed"));
      return;
    }

    setCapturing(true);
    if (__DEV__) {
      console.log(`${LOG_PREFIX} start capture`, { nodeId });
    }
    try {
      // `--upload` tells the device to capture AND upload the snapshot; the
      // success response carries the file id it is uploading to.
      const data: CameraCaptureCmdData = {
        cmd: CAMERA_CMD_JPEG_CAPTURE,
        args: [CAMERA_CMD_ARG_UPLOAD],
      };
      // CDF types `T` as both params and return; cast the SDK send result.
      const send = (await espCDFUser.createCmdRespRequest({
        nodeIds: [nodeId],
        cmdId: CAMERA_SNAPSHOT_COMMAND_ID,
        timeoutSeconds: NODE_CMD_DEFAULT_TIMEOUT,
        data,
      })) as unknown as CmdRespSendResult;

      if (__DEV__) {
        console.log(`${LOG_PREFIX} cmd-resp created`, {
          nodeId,
          requestId: send.requestId,
        });
      }

      const pollResult = await pollUntilReady<CmdRespTerminalResult>(
        async () => {
          const requests =
            await espCDFUser.getCmdRespRequestById<CmdRespRequestStatus[]>(
              send.requestId,
              nodeId,
            );
          const first = Array.isArray(requests) ? requests[0] : undefined;
          const status = first?.status ?? "";

          if (__DEV__) {
            console.log(`${LOG_PREFIX} poll status`, {
              nodeId,
              requestId: send.requestId,
              status: status || "(empty)",
            });
          }

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
        if (__DEV__) {
          console.warn(`${LOG_PREFIX} poll exhausted without terminal status`, {
            nodeId,
            requestId: send.requestId,
            attempts: pollResult.attempts,
          });
        }
        toast.showError(t("device.camera.capture.timedOut"));
        return;
      }

      const { status, responseData } = pollResult.data;

      if (status === NODE_CMD_STATUS_SUCCESS) {
        // Device accepted the capture + upload request; the snapshot uploads
        // asynchronously and appears in the gallery on its next refresh.
        if (__DEV__) {
          console.log(`${LOG_PREFIX} capture submitted`, {
            nodeId,
            requestId: send.requestId,
            responseData,
          });
        }
        toast.showSuccess(
          t("device.camera.capture.submitted"),
          captureDetail(responseData),
        );
        return;
      }
      if (status === NODE_CMD_STATUS_FAILURE) {
        if (__DEV__) {
          console.warn(`${LOG_PREFIX} capture failed`, {
            nodeId,
            requestId: send.requestId,
            responseData,
          });
        }
        toast.showError(t("device.camera.capture.failed"));
        return;
      }
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} capture timed out`, {
          nodeId,
          requestId: send.requestId,
          status,
        });
      }
      toast.showError(t("device.camera.capture.timedOut"));
    } catch {
      toast.showError(t("device.camera.capture.failed"));
    } finally {
      if (__DEV__) {
        console.log(`${LOG_PREFIX} capture finished`, { nodeId });
      }
      setCapturing(false);
    }
  }, [capturing, espCDFUser, nodeId, t, toast]);

  return { capturing, captureSnapshot };
};
