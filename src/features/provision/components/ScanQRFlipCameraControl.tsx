/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { SwitchCamera } from "lucide-react-native";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

export interface ScanQRFlipCameraControlProps {
  /** Toggles front / back camera facing. */
  onToggle: () => void;
}

/**
 * ScanQRFlipCameraControl
 *
 * Top-right accessory for the QR camera: flips between front and back cameras.
 * @param props - Toggle callback
 * @returns Flip-camera control overlaid on the scanner
 */
export const ScanQRFlipCameraControl = ({
  onToggle,
}: ScanQRFlipCameraControlProps) => {
  const { t } = useTranslation();

  return (
    <View
      {...testProps("view_camera_flip_controls")}
      style={globalStyles.cameraFlipTopBar}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        {...testProps("button_camera_toggle")}
        style={globalStyles.cameraFlipButton}
        onPress={onToggle}
      >
        <SwitchCamera
          {...testProps("icon_camera_flip")}
          size={22}
          color={tokens.colors.white}
        />
        <Text
          {...testProps("text_camera_flip")}
          style={globalStyles.cameraFlipLabel}
        >
          {t("device.scan.qr.flipCamera")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
