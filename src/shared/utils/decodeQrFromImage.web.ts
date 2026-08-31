/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import jsQR from "jsqr";
import {
  QR_IMAGE_BARCODE_FORMAT,
  QR_IMAGE_CANVAS_CONTEXT_2D,
  QR_IMAGE_DECODE_MAX_EDGE,
} from "@shared/utils/constants";
import { QrImageDecodeError } from "@shared/utils/qrImageDecodeError";

interface QrBarcodeDetector {
  detect(image: ImageBitmap): Promise<{ rawValue?: string }[]>;
}

interface QrBarcodeDetectorCtor {
  new (options: { formats: string[] }): QrBarcodeDetector;
}

/**
 * Returns the browser BarcodeDetector constructor when it is available.
 * @returns Constructor, or undefined on unsupported browsers
 */
function getBarcodeDetectorCtor(): QrBarcodeDetectorCtor | undefined {
  if (typeof globalThis === "undefined") {
    return undefined;
  }
  return (globalThis as { BarcodeDetector?: QrBarcodeDetectorCtor })
    .BarcodeDetector;
}

/**
 * Draws a bitmap onto a canvas, downscaling when the longest edge exceeds the cap.
 * @param bitmap - Source image
 * @returns Canvas sized for QR decode
 */
function drawBitmapToCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale =
    longest > QR_IMAGE_DECODE_MAX_EDGE
      ? QR_IMAGE_DECODE_MAX_EDGE / longest
      : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext(QR_IMAGE_CANVAS_CONTEXT_2D);
  if (!context) {
    throw new QrImageDecodeError("Could not read image for QR decode.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/**
 * Decodes a QR payload with jsQR from canvas pixel data.
 * @param canvas - Image already drawn at decode size
 * @returns Raw QR text when found
 */
function decodeQrWithJsQr(canvas: HTMLCanvasElement): string | null {
  const context = canvas.getContext(QR_IMAGE_CANVAS_CONTEXT_2D);
  if (!context) {
    return null;
  }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  return result?.data ?? null;
}

/**
 * Reads a QR code from an image blob (paste, drop, or file picker).
 * Prefers the Barcode Detector API; falls back to jsQR.
 * @param blob - Image bytes
 * @returns QR payload string
 */
export async function decodeQrFromImageBlob(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const Detector = getBarcodeDetectorCtor();
    if (Detector) {
      const detector = new Detector({
        formats: [QR_IMAGE_BARCODE_FORMAT],
      });
      const codes = await detector.detect(bitmap);
      const rawValue = codes[0]?.rawValue?.trim();
      if (rawValue) {
        return rawValue;
      }
    }

    const fromJsQr = decodeQrWithJsQr(drawBitmapToCanvas(bitmap));
    if (fromJsQr?.trim()) {
      return fromJsQr.trim();
    }

    throw new QrImageDecodeError("No QR code found in this image.");
  } finally {
    bitmap.close();
  }
}
