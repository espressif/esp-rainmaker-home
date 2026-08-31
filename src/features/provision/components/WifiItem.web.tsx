/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Wifi as WifiIcon, Lock } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { WifiNetwork } from "@src/types/global";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { getSignalStrength, getOpacityFromStrength } from "@features/provision/utils/wifiHelper";
import { flattenStyle } from "@shared/utils/flattenStyle";
import { testProps } from "@shared/utils/testProps";

interface WifiItemProps {
  item: WifiNetwork;
  onSelect: (ssid: string) => void;
  isLastUsed?: boolean;
}

/**
 * Web Wi-Fi list row with flattened touchable styles.
 * @param props - Network item, selection handler, and last-used flag.
 * @returns One selectable Wi-Fi network row.
 */
export const WifiItem: React.FC<WifiItemProps> = ({
  item,
  onSelect,
  isLastUsed = false,
}) => {
  const { t } = useTranslation();
  const signalInfo = getSignalStrength(item.rssi, t);

  return (
    <TouchableOpacity
      style={flattenStyle([globalStyles.settingsItem])}
      {...testProps("wifi_item")}
      onPress={() => onSelect(item.ssid)}
    >
      <View style={globalStyles.settingsItemLeft} {...testProps("view_wifi")}>
        <WifiIcon
          {...testProps("icon_wifi_strength")}
          size={20}
          color={signalInfo.color}
          style={flattenStyle({
            ...globalStyles.settingsItemIcon,
            opacity: getOpacityFromStrength(signalInfo.strength),
          })}
        />
        <View style={{ flex: 1 }} {...testProps("view_wifi")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} {...testProps("view_wifi")}>
            {item.secure && <Lock {...testProps("icon_lock")} size={14} color={tokens.colors.gray} />}
            <Text style={globalStyles.settingsItemText} {...testProps("text_ssid")}>{item.ssid}</Text>
            {isLastUsed && (
              <Text style={styles.lastUsedTag} {...testProps("text_last_used_wifi")}>
                {t("device.wifi.lastUsed")}
              </Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = {
  lastUsedTag: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
  },
};
