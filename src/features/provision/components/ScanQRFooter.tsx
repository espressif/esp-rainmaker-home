/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { QrCode } from "lucide-react-native";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import { ConnectingStatusFooter } from "./ConnectingStatusFooter";

interface ScanQRFooterProps {
  /** When true, shows the Scan Again control. */
  showScanAgain: boolean;
  /** When true (and not scan-again), shows the connecting shimmer. */
  isConnecting: boolean;
  /** Resets scan state and remounts the camera. */
  onScanAgain: () => void;
  /** Continues without a QR code (BLE / SoftAP / On-Network). */
  onContinueWithoutQr: () => void;
}

/**
 * ScanQRFooter
 *
 * Bottom band for the QR scan screen: No QR | Connecting status | Scan Again.
 * @param props - Footer mode flags and action callbacks
 * @returns Absolute-positioned footer actions for the QR scan flow
 */
export const ScanQRFooter = ({
  showScanAgain,
  isConnecting,
  onScanAgain,
  onContinueWithoutQr,
}: ScanQRFooterProps) => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.noQrCodeRow} pointerEvents="box-none">
      {showScanAgain ? (
        <TouchableOpacity
          {...testProps("button_rescan")}
          style={globalStyles.connectingStatusButton}
          onPress={onScanAgain}
        >
          <QrCode
            {...testProps("icon_button")}
            size={20}
            color={tokens.colors.primary}
            style={globalStyles.buttonIcon}
          />
          <Text
            {...testProps("text_scan_again")}
            style={globalStyles.connectingStatusText}
          >
            {t("device.scan.qr.scanAgain")}
          </Text>
        </TouchableOpacity>
      ) : isConnecting ? (
        <ConnectingStatusFooter />
      ) : (
        <TouchableOpacity
          {...testProps("button_no_qr_code")}
          style={[
            globalStyles.actionButton,
            globalStyles.actionButtonSecondary,
            globalStyles.noQrCodeFooterButton,
          ]}
          onPress={onContinueWithoutQr}
        >
          <Text
            {...testProps("text_no_qr_code")}
            style={globalStyles.permissionFooterButtonText}
          >
            {t("device.scan.qr.noQrCode")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
