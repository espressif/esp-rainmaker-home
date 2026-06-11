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
import { captureDetail, runCameraJpegCapture } from "../utils/cameraHelpers";

// Constants
import {
  CAMERA_CMD_ARG_UPLOAD,
  NODE_CMD_STATUS_SUCCESS,
  NODE_CMD_STATUS_FAILURE,
  NODE_CMD_STATUS_TIMED_OUT,
} from "../constants";

// Types
import type { UseCameraCommandReturn } from "../types";

const LOG_PREFIX = "[useCameraCommand]";

/**
 * Hook to trigger a device-side JPEG snapshot capture via the CDF
 * command-response flow (send `jpeg-capture` with `--upload`, then poll until
 * the request reaches a terminal status). Surfaces success/failure through the
 * toast. Shares {@link runCameraJpegCapture} with the agent snapshot tool.
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
      const { status, responseData } = await runCameraJpegCapture(
        espCDFUser,
        nodeId,
        [CAMERA_CMD_ARG_UPLOAD],
      );

      if (__DEV__) {
        console.log(`${LOG_PREFIX} capture terminal`, {
          nodeId,
          status,
          responseData,
        });
      }

      if (status === NODE_CMD_STATUS_SUCCESS) {
        // Device accepted the capture + upload request; the snapshot uploads
        // asynchronously and appears in the gallery on its next refresh.
        toast.showSuccess(
          t("device.camera.capture.submitted"),
          captureDetail(responseData),
        );
        return;
      }
      if (status === NODE_CMD_STATUS_FAILURE) {
        toast.showError(t("device.camera.capture.failed"));
        return;
      }
      if (status === NODE_CMD_STATUS_TIMED_OUT) {
        toast.showError(t("device.camera.capture.timedOut"));
        return;
      }
      toast.showError(t("device.camera.capture.timedOut"));
    } catch (error) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} capture error`, { nodeId, error });
      }
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
