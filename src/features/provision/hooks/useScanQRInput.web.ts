/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  PROVISION_QR_SOURCE_ERROR_CLIPBOARD_DENIED,
  PROVISION_QR_SOURCE_ERROR_EMPTY,
  PROVISION_QR_SOURCE_ERROR_NO_QR,
  PROVISION_QR_SOURCE_ERROR_UNSUPPORTED,
} from "@features/provision/constants";
import { asProvisionQrSourceError } from "@features/provision/utils/provisionQrSourceError";
import {
  isProvisionQrImageFile,
  readProvisionQrFromClipboard,
  readProvisionQrFromFile,
} from "@features/provision/utils/readProvisionQrSource.web";
import {
  useWebFileInput,
  type UseWebFileInputAdapter,
  type UseWebFileInputReturn,
} from "@shared/hooks/useWebFileInput.web";

export type UseScanQRInputReturn = UseWebFileInputReturn;

/**
 * Maps a source/read error to translated copy for the QR input view.
 * @param error - Thrown value from file / clipboard / QR decode
 * @param translate - i18n `t` function
 * @returns User-visible error string
 */
function mapSourceError(
  error: unknown,
  translate: (key: string) => string,
): string {
  const source = asProvisionQrSourceError(error);
  if (source?.code === PROVISION_QR_SOURCE_ERROR_NO_QR) {
    return translate("device.scan.qr.noQrInImage");
  }
  if (source?.code === PROVISION_QR_SOURCE_ERROR_UNSUPPORTED) {
    return translate("device.scan.qr.unsupportedFile");
  }
  if (source?.code === PROVISION_QR_SOURCE_ERROR_EMPTY) {
    return translate("device.scan.qr.emptyInput");
  }
  if (source?.code === PROVISION_QR_SOURCE_ERROR_CLIPBOARD_DENIED) {
    return translate("device.scan.qr.clipboardDenied");
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return translate("device.scan.qr.emptyInput");
}

/**
 * Web input state for the provision QR screen — paste, drop, `/embed`
 * postMessage forwarding, file picker, and raw-payload textarea. Thin
 * wrapper over the shared {@link useWebFileInput}.
 * @param onScan - Applies a resolved QR payload string
 * @param enabled - When false, ignores paste/drop (e.g. while connecting)
 */
export function useScanQRInput(
  onScan: (scannedValue: string) => Promise<void>,
  enabled: boolean = true,
): UseScanQRInputReturn {
  const { t } = useTranslation();
  const adapter = useMemo<UseWebFileInputAdapter>(
    () => ({
      readFromFile: readProvisionQrFromFile,
      readFromClipboard: readProvisionQrFromClipboard,
      isImageFile: isProvisionQrImageFile,
      mapError: (error) => mapSourceError(error, t),
      emptyErrorText: t("device.scan.qr.emptyInput"),
    }),
    [t],
  );
  return useWebFileInput(onScan, adapter, enabled);
}
