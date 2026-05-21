/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { RotateCcw, CircleAlert } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ContentWrapper } from "@shared/components";
import { testProps } from "@shared/utils/testProps";

interface NoDevicesFoundProps {
  onScanAgain: () => void;
  /**
   * BLE-only: the device-name prefix being scanned for (e.g. `PROV_`).
   * Renders inline next to the BLE default message. Ignored when `message`
   * is provided.
   */
  devicePrefix?: string;
  /**
   * Optional title override. Defaults to the BLE "No Devices Found" string.
   * Pass this from non-BLE callers (e.g. on-network) to surface the right
   * heading.
   */
  title?: string;
  /**
   * Optional full-message override. When provided, the BLE default message
   * + `devicePrefix` chip are replaced by this single string. Use this from
   * non-BLE callers that want a flow-specific empty-state message.
   */
  message?: string;
  style?: any;
}

/**
 * NoDevicesFound
 *
 * Displays a flow-agnostic empty state with a circular alert icon, a title,
 * an explanatory message, and a refresh affordance for re-scan. Defaults to
 * BLE-flavoured copy for backward compatibility with `ScanBLE`; callers
 * from other flows (on-network, SoftAP, ...) can override the title and
 * message via props.
 * @param props - onScanAgain handler, optional title/message overrides,
 *   optional BLE devicePrefix chip, and optional style.
 * @returns Content wrapper with title, message, and rescan affordance.
 */
export const NoDevicesFound: React.FC<NoDevicesFoundProps> = ({
  onScanAgain,
  devicePrefix,
  title,
  message,
  style,
}) => {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("device.scan.ble.noDevicesFound");
  const isMessageOverridden = typeof message === "string";

  return (
    <ContentWrapper
      title={resolvedTitle}
      style={style}
      leftSlot={
        <TouchableOpacity
          {...testProps("button_rescan")}
          onPress={onScanAgain}
          style={styles.rescanButton}
        >
          <RotateCcw size={20} color={tokens.colors.primary} />
        </TouchableOpacity>
      }
      qaId="no_devices_found_scan_ble"
    >
      <View style={styles.emptyContainer}>
        <View style={styles.noDeviceContent}>
          <View style={styles.noDeviceIconContainer}>
            <CircleAlert size={48} color={tokens.colors.primary} />
          </View>
          <Text
            {...testProps("text_no_device_message")}
            style={[globalStyles.textGray, styles.noDeviceMessage]}
          >
            {isMessageOverridden ? (
              message
            ) : (
              <>
                {t("device.scan.ble.noDeviceMessage")}{" "}
                <Text
                  {...testProps("text_prefix_value")}
                  style={[
                    globalStyles.fontMd,
                    globalStyles.textPrimary,
                    styles.prefixValue,
                  ]}
                >
                  {devicePrefix}
                </Text>
              </>
            )}
          </Text>
        </View>
      </View>
    </ContentWrapper>
  );
};

const styles = StyleSheet.create({
  rescanButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: tokens.spacing._20,
  },
  noDeviceContent: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  noDeviceIconContainer: {
    marginBottom: tokens.spacing._20,
    padding: tokens.spacing._15,
    borderRadius: 50,
    backgroundColor: tokens.colors.bg4,
  },
  noDeviceMessage: {
    marginBottom: tokens.spacing._15,
    textAlign: "center",
    paddingHorizontal: tokens.spacing._20,
  },
  prefixValue: {
    fontWeight: "600",
    fontFamily: "monospace",
  },
});
