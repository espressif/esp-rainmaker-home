/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CONFIG_SCAN_JSON_EXTENSION,
  CONFIG_SCAN_SOURCE_ERROR_CLIPBOARD_DENIED,
  CONFIG_SCAN_SOURCE_ERROR_EMPTY,
  CONFIG_SCAN_SOURCE_ERROR_UNSUPPORTED,
} from "@features/config/constants";
import {
  DOM_EXCEPTION_NOT_ALLOWED,
  IMAGE_MIME_TYPE_PREFIX,
  JSON_MIME_TYPE,
  TEXT_MIME_TYPE_PLAIN,
} from "@shared/utils/constants";
import { ConfigScanSourceError } from "./configScanSourceError";
import { decodeQrFromImageBlob } from "./decodeQrFromImage.web";

/**
 * @param fileName - File name from picker / drop
 * @returns Whether the name ends with `.json`
 */
function hasJsonExtension(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(CONFIG_SCAN_JSON_EXTENSION);
}

/**
 * @param file - Browser File from picker, drop, or clipboard
 * @returns Whether the file should be treated as an image
 */
export function isConfigScanImageFile(file: File): boolean {
  return file.type.startsWith(IMAGE_MIME_TYPE_PREFIX);
}

/**
 * @param file - Browser File from picker, drop, or clipboard
 * @returns Whether the file should be treated as JSON / text config
 */
export function isConfigScanJsonFile(file: File): boolean {
  return file.type === JSON_MIME_TYPE || hasJsonExtension(file.name);
}

/**
 * Reads a dropped / picked file into the same string `handleScan` expects.
 * @param file - Image (QR) or JSON file
 * @returns QR payload, JSON text, or URL text
 */
export async function readConfigValueFromFile(file: File): Promise<string> {
  if (isConfigScanJsonFile(file)) {
    const text = (await file.text()).trim();
    if (!text) {
      throw new ConfigScanSourceError(
        CONFIG_SCAN_SOURCE_ERROR_EMPTY,
        "The JSON file is empty.",
      );
    }
    return text;
  }

  if (isConfigScanImageFile(file)) {
    return decodeQrFromImageBlob(file);
  }

  throw new ConfigScanSourceError(
    CONFIG_SCAN_SOURCE_ERROR_UNSUPPORTED,
    "Use a QR image or a JSON file.",
  );
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
 * @returns Config string when clipboard has an image or text
 */
export async function readConfigValueFromClipboard(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new ConfigScanSourceError(
      CONFIG_SCAN_SOURCE_ERROR_CLIPBOARD_DENIED,
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
          return decodeQrFromImageBlob(blob);
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
      if (!isClipboardPermissionDenied(error)) {
        throw error;
      }
      // Fall through to readText(); iframe policy may still allow text.
    }
  }

  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      throw new ConfigScanSourceError(
        CONFIG_SCAN_SOURCE_ERROR_EMPTY,
        "Clipboard is empty.",
      );
    }
    return text;
  } catch (error) {
    if (error instanceof ConfigScanSourceError) {
      throw error;
    }
    throw new ConfigScanSourceError(
      CONFIG_SCAN_SOURCE_ERROR_CLIPBOARD_DENIED,
      "Clipboard read permission denied.",
    );
  }
}
