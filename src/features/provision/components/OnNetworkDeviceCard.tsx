/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { deviceImages } from "@shared/utils/device";
import { testProps } from "@shared/utils/testProps";

interface OnNetworkDeviceCardProps {
  /** Primary line — raw mDNS service instance name (e.g. `ESP-Device-188B0EB1B4AC`). */
  serviceName: string;
  /** Secondary line — RainMaker node id from TXT `node_id`. */
  nodeId: string;
  /** Whether the firmware advertises that it requires a POP code. */
  popRequired: boolean;
  /** Tap handler. */
  onPress: () => void;
}

/**
 * OnNetworkDeviceCard
 *
 * Tappable row used by the OnNetworkDiscovery screen. Shows the raw mDNS
 * service instance name as the primary label, the RainMaker node id as a
 * secondary label, and a colored badge indicating whether the device demands
 * a Proof-of-Possession code before it will accept the challenge response.
 *
 * Mirrors the visual structure of `ScannedDeviceCard` (icon + info column)
 * but with a two-line text block + status badge — kept as a separate
 * component so the BLE / SoftAP screens are unaffected.
 * @param props - serviceName, nodeId, popRequired and onPress.
 * @returns Tappable row with device image, two text lines, and POP badge.
 */
export const OnNetworkDeviceCard: React.FC<OnNetworkDeviceCardProps> = ({
  serviceName,
  nodeId,
  popRequired,
  onPress,
}) => {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      {...testProps("button_on_network_device")}
      style={[globalStyles.deviceCard, styles.row]}
      onPress={onPress}
    >
      <Image
        {...testProps("image_icon_on_network_device")}
        source={deviceImages["light-1-online"]}
        style={globalStyles.deviceIcon}
        resizeMode="contain"
      />
      <View
        {...testProps("view_info_on_network_device")}
        style={globalStyles.deviceInfo}
      >
        <Text
          {...testProps("text_on_network_service_name")}
          style={globalStyles.deviceName}
          numberOfLines={1}
        >
          {serviceName}
        </Text>
        <Text
          {...testProps("text_on_network_node_id")}
          style={styles.subtitle}
          numberOfLines={1}
        >
          {nodeId}
        </Text>
      </View>
      <View
        {...testProps("view_pop_badge_on_network")}
        style={[
          styles.badge,
          popRequired ? styles.badgePopRequired : styles.badgeNoPop,
        ]}
      >
        <Text
          {...testProps("text_pop_badge_on_network")}
          style={[
            styles.badgeText,
            popRequired
              ? styles.badgeTextPopRequired
              : styles.badgeTextNoPop,
          ]}
        >
          {popRequired
            ? t("device.onNetwork.popRequiredBadge")
            : t("device.onNetwork.noPopBadge")}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    padding: tokens.spacing._10,
  },
  subtitle: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text_secondary,
    fontFamily: tokens.fonts.regular,
  },
  badge: {
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
    marginLeft: tokens.spacing._10,
  },
  badgePopRequired: {
    backgroundColor: tokens.colors.bg4,
  },
  badgeNoPop: {
    backgroundColor: tokens.colors.bg5,
  },
  badgeText: {
    fontSize: tokens.fontSize.xxs,
    fontFamily: tokens.fonts.medium,
  },
  badgeTextPopRequired: {
    color: tokens.colors.primary,
  },
  badgeTextNoPop: {
    color: tokens.colors.text_secondary,
  },
});
