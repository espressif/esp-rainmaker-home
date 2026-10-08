/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONFIG_SCAN_SOURCE_ERROR_NO_QR } from "@features/config/constants";
import { decodeQrFromImageBlob as decodeSharedQrFromImageBlob } from "@shared/utils/decodeQrFromImage.web";
import { asQrImageDecodeError } from "@shared/utils/qrImageDecodeError";
import { ConfigScanSourceError } from "./configScanSourceError";

/**
 * Reads a QR code from an image blob for config scan.
 * Wraps the shared decoder so failures stay typed as {@link ConfigScanSourceError}.
 * @param blob - Image bytes
 * @returns QR payload string
 */
export async function decodeQrFromImageBlob(blob: Blob): Promise<string> {
  try {
    return await decodeSharedQrFromImageBlob(blob);
  } catch (error) {
    const qrError = asQrImageDecodeError(error);
    if (qrError) {
      throw new ConfigScanSourceError(
        CONFIG_SCAN_SOURCE_ERROR_NO_QR,
        qrError.message,
      );
    }
    throw error;
  }
}
