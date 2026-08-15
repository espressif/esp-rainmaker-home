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

export interface ConfigScanFooterProps {
  /** When true, shows the Scan Again control after an invalid QR. */
  showScanAgain: boolean;
  /** Resets scan state and remounts the camera. */
  onScanAgain: () => void;
}

/**
 * Bottom band for the config QR scanner — Scan Again after an invalid hit
 * (same control pattern as provision ScanQR).
 * @param props - Visibility flag and retry callback
 * @returns Absolute-positioned footer, or null when idle
 */
export function ConfigScanFooter({
  showScanAgain,
  onScanAgain,
}: ConfigScanFooterProps) {
  const { t } = useTranslation();

  if (!showScanAgain) {
    return null;
  }

  return (
    <View style={globalStyles.noQrCodeRow} pointerEvents="box-none">
      <TouchableOpacity
        {...testProps("button_config_rescan")}
        style={globalStyles.connectingStatusButton}
        onPress={onScanAgain}
      >
        <QrCode
          {...testProps("icon_config_rescan")}
          size={20}
          color={tokens.colors.primary}
          style={globalStyles.buttonIcon}
        />
        <Text
          {...testProps("text_config_scan_again")}
          style={globalStyles.connectingStatusText}
        >
          {t("device.scan.qr.scanAgain")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
