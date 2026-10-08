/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PROVISION_QR_SOURCE_ERROR_CLIPBOARD_DENIED,
  PROVISION_QR_SOURCE_ERROR_EMPTY,
  PROVISION_QR_SOURCE_ERROR_NO_QR,
  PROVISION_QR_SOURCE_ERROR_UNSUPPORTED,
} from "@features/provision/constants";
import { ProvisionQrSourceError } from "@features/provision/utils/provisionQrSourceError";
import {
  DOM_EXCEPTION_NOT_ALLOWED,
  IMAGE_MIME_TYPE_PREFIX,
  TEXT_MIME_TYPE_PLAIN,
} from "@shared/utils/constants";
import { decodeQrFromImageBlob } from "@shared/utils/decodeQrFromImage.web";
import {
  asQrImageDecodeError,
  QrImageDecodeError,
} from "@shared/utils/qrImageDecodeError";

/**
 * @param file - Browser File from picker, drop, or clipboard
 * @returns Whether the file should be treated as an image
 */
export function isProvisionQrImageFile(file: File): boolean {
  return file.type.startsWith(IMAGE_MIME_TYPE_PREFIX);
}

/**
 * Reads a dropped / picked QR image into the raw payload string.
 * @param file - Image file containing a device QR
 * @returns QR payload text
 */
export async function readProvisionQrFromFile(file: File): Promise<string> {
  if (!isProvisionQrImageFile(file)) {
    throw new ProvisionQrSourceError(
      PROVISION_QR_SOURCE_ERROR_UNSUPPORTED,
      "Use a QR image file.",
    );
  }

  try {
    return await decodeQrFromImageBlob(file);
  } catch (error) {
    const qrError = asQrImageDecodeError(error);
    if (qrError || error instanceof QrImageDecodeError) {
      throw new ProvisionQrSourceError(
        PROVISION_QR_SOURCE_ERROR_NO_QR,
        qrError?.message ?? "No QR code found in this image.",
      );
    }
    throw error;
  }
}

/**
 * @param error - Caught clipboard API failure
 * @returns Whether the browser blocked clipboard access
 */
function isClipboardPermissionDenied(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  return error.name === DOM_EXCEPTION_NOT_ALLOWED;
}

/**
 * Reads image or text from the async clipboard API (Paste button).
 * @returns QR payload when clipboard has an image or text
 */
export async function readProvisionQrFromClipboard(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new ProvisionQrSourceError(
      PROVISION_QR_SOURCE_ERROR_CLIPBOARD_DENIED,
      "Clipboard is not available.",
    );
  }

  if (navigator.clipboard.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) =>
          type.startsWith(IMAGE_MIME_TYPE_PREFIX),
        );
        if (imageType) {
          const blob = await item.getType(imageType);
          try {
            return await decodeQrFromImageBlob(blob);
          } catch (error) {
            const qrError = asQrImageDecodeError(error);
            throw new ProvisionQrSourceError(
              PROVISION_QR_SOURCE_ERROR_NO_QR,
              qrError?.message ?? "No QR code found in this image.",
            );
          }
        }
        if (item.types.includes(TEXT_MIME_TYPE_PLAIN)) {
          const blob = await item.getType(TEXT_MIME_TYPE_PLAIN);
          const text = (await blob.text()).trim();
          if (text) {
            return text;
          }
        }
      }
    } catch (error) {
      if (error instanceof ProvisionQrSourceError) {
        throw error;
      }
      if (!isClipboardPermissionDenied(error)) {
        throw error;
      }
      // Fall through to readText(); iframe policy may still allow text.
    }
  }

  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      throw new ProvisionQrSourceError(
        PROVISION_QR_SOURCE_ERROR_EMPTY,
        "Clipboard is empty.",
      );
    }
    return text;
  } catch (error) {
    if (error instanceof ProvisionQrSourceError) {
      throw error;
    }
    throw new ProvisionQrSourceError(
      PROVISION_QR_SOURCE_ERROR_CLIPBOARD_DENIED,
      "Clipboard read permission denied.",
    );
  }
}
