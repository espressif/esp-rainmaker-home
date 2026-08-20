/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Re-export shared camera capture helpers for control-domain callers.
 * Canonical implementation: `@shared/utils/camera/cameraCapture`.
 */
export {
  formatSize,
  captureDetail,
  decodeResponseData,
  runCameraJpegCapture,
  parseAgentCaptureResponse,
} from "@shared/utils/camera/cameraCapture";
