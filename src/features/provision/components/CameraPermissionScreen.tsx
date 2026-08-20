/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Camera, CameraOff } from "lucide-react-native";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import {
  PERMISSION_UI_STATUS_DENIED,
  PERMISSION_UI_STATUS_REQUESTING,
} from "@features/provision/constants";

type CameraPermissionStatus =
  | typeof PERMISSION_UI_STATUS_REQUESTING
  | typeof PERMISSION_UI_STATUS_DENIED;

interface CameraPermissionScreenProps {
  /** Whether permission is still loading or was denied. */
  status: CameraPermissionStatus;
  /** Opens the system camera permission prompt (or Settings when blocked). */
  onRequestPermission: () => void | Promise<void>;
  /** Continues provisioning without scanning a QR code. */
  onContinueWithoutQr: () => void;
}

/**
 * CameraPermissionScreen
 *
 * Shown while camera permission is loading or denied. Content stays centered;
 * denied actions pin to the bottom (same footer pattern as other provision screens).
 * Both actions use a light secondary button style — Request Permission and
 * continue without a QR code.
 * @param props - Permission status and action callbacks
 * @returns Permission request / denied UI for the QR scan flow
 */
export const CameraPermissionScreen = ({
  status,
  onRequestPermission,
  onContinueWithoutQr,
}: CameraPermissionScreenProps) => {
  const { t } = useTranslation();

  return (
    <View
      {...testProps("view_permission_screen")}
      style={[globalStyles.container, globalStyles.permissionScreen]}
    >
      <View
        {...testProps("view_permission_content")}
        style={[
          globalStyles.permissionContent,
          globalStyles.permissionContentCenter,
        ]}
      >
        <View
          {...testProps("view_permission_icon")}
          style={globalStyles.permissionIconContainer}
        >
          <CameraOff size={40} color={tokens.colors.gray} />
        </View>
        <Text
          {...testProps("text_permission_title_scan_qr")}
          style={[globalStyles.heading, globalStyles.permissionTitle]}
        >
          {status === PERMISSION_UI_STATUS_REQUESTING
            ? t("device.scan.qr.requestingPermission")
            : t("device.scan.qr.noCameraPermission")}
        </Text>
        <Text
          {...testProps("text_permission_msg_scan_qr")}
          style={[globalStyles.textGray, globalStyles.permissionDescription]}
        >
          {t("device.scan.qr.cameraPermissionRequired")}
        </Text>
      </View>

      {status === PERMISSION_UI_STATUS_DENIED && (
        <View
          {...testProps("view_permission_actions")}
          style={globalStyles.permissionFooter}
        >
          <TouchableOpacity
            {...testProps("button_permission")}
            style={[
              globalStyles.actionButton,
              globalStyles.actionButtonSecondary,
              globalStyles.permissionFooterButton,
            ]}
            onPress={onRequestPermission}
          >
            <Camera
              size={20}
              color={tokens.colors.text_primary}
              style={globalStyles.buttonIcon}
            />
            <Text
              {...testProps("text_grant_permission_scan_qr")}
              style={globalStyles.permissionFooterButtonText}
            >
              {t("device.scan.qr.grantPermission")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            {...testProps("button_no_qr_code_permission")}
            style={[
              globalStyles.actionButton,
              globalStyles.actionButtonSecondary,
              globalStyles.permissionFooterButton,
            ]}
            onPress={onContinueWithoutQr}
          >
            <Text
              {...testProps("text_no_qr_code_permission")}
              style={globalStyles.permissionFooterButtonText}
            >
              {t("device.scan.qr.noQrCode")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};
