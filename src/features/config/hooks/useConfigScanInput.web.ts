/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CONFIG_SCAN_SOURCE_ERROR_CLIPBOARD_DENIED,
  CONFIG_SCAN_SOURCE_ERROR_EMPTY,
  CONFIG_SCAN_SOURCE_ERROR_NO_QR,
  CONFIG_SCAN_SOURCE_ERROR_UNSUPPORTED,
} from "@features/config/constants";
import { asConfigScanSourceError } from "@features/config/utils/configScanSourceError";
import {
  isConfigScanImageFile,
  readConfigValueFromClipboard,
  readConfigValueFromFile,
} from "@features/config/utils/readConfigSource.web";
import {
  useWebFileInput,
  type UseWebFileInputAdapter,
  type UseWebFileInputReturn,
} from "@shared/hooks/useWebFileInput.web";

export type UseConfigScanInputReturn = UseWebFileInputReturn;

/**
 * Maps a source/read error to translated copy for the config input view.
 * @param error - Thrown value from file / clipboard / QR decode
 * @param translate - i18n `t` function
 * @returns User-visible error string
 */
function mapSourceError(
  error: unknown,
  translate: (key: string) => string,
): string {
  const source = asConfigScanSourceError(error);
  if (source?.code === CONFIG_SCAN_SOURCE_ERROR_NO_QR) {
    return translate("config.scan.noQrInImage");
  }
  if (source?.code === CONFIG_SCAN_SOURCE_ERROR_UNSUPPORTED) {
    return translate("config.scan.unsupportedFile");
  }
  if (source?.code === CONFIG_SCAN_SOURCE_ERROR_EMPTY) {
    return translate("config.scan.emptyInput");
  }
  if (source?.code === CONFIG_SCAN_SOURCE_ERROR_CLIPBOARD_DENIED) {
    return translate("config.scan.clipboardDenied");
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return translate("config.scan.emptyInput");
}

/**
 * Web input state for the config scan screen — paste, drop, `/embed`
 * postMessage forwarding, file picker, and JSON/URL textarea. Thin wrapper
 * over the shared {@link useWebFileInput}.
 * @param onScan - Applies a resolved config string (JSON or http(s) URL)
 */
export function useConfigScanInput(
  onScan: (scannedValue: string) => Promise<void>,
): UseConfigScanInputReturn {
  const { t } = useTranslation();
  const adapter = useMemo<UseWebFileInputAdapter>(
    () => ({
      readFromFile: readConfigValueFromFile,
      readFromClipboard: readConfigValueFromClipboard,
      isImageFile: isConfigScanImageFile,
      mapError: (error) => mapSourceError(error, t),
      emptyErrorText: t("config.scan.emptyInput"),
    }),
    [t],
  );
  return useWebFileInput(onScan, adapter);
}
