/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { TEXT_MIME_TYPE_PLAIN } from "@shared/utils/constants";

const DATA_TRANSFER_ITEM_KIND_FILE = "file";

/**
 * Picks the first file from a DataTransfer payload (paste or drop).
 * @param dataTransfer - Clipboard or drop payload
 * @returns First file, or null
 */
export function getFirstDataTransferFile(
  dataTransfer: DataTransfer | null,
): File | null {
  if (!dataTransfer) {
    return null;
  }
  if (dataTransfer.files.length > 0) {
    return dataTransfer.files[0];
  }
  const items = Array.from(dataTransfer.items);
  const fileItem = items.find(
    (item) => item.kind === DATA_TRANSFER_ITEM_KIND_FILE,
  );
  return fileItem?.getAsFile() ?? null;
}

/**
 * Reads plain text from a DataTransfer payload (paste).
 * @param dataTransfer - Clipboard payload
 * @returns Trimmed text, or empty string
 */
export function getDataTransferPlainText(
  dataTransfer: DataTransfer | null,
): string {
  if (!dataTransfer) {
    return "";
  }
  return dataTransfer.getData(TEXT_MIME_TYPE_PLAIN).trim();
}
