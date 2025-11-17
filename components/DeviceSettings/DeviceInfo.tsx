/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";

// Components
import CollapsibleCard from "../Cards/CollapsibleCard";
import InfoRow from "../Info/InfoRow";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";
import { Copy } from "lucide-react-native";

// Hooks
import { useToast } from "@/hooks/useToast";

// Types
import { DeviceInfoProps } from "@/types/global";

/**
 * DeviceInfo Component
 *
 * Displays device information in a collapsible card format.
 * Shows device ID, type, IP, version, and configuration time.
 *
 * @param props - Component properties containing device information
 */
const DeviceInfo: React.FC<DeviceInfoProps> = ({ node, nodeConfig }) => {
  const { t } = useTranslation();
  const toast = useToast();

  if (!node) return null;

  const handleCopyNodeId = async () => {
    try {
      await Clipboard.setStringAsync(node.id);
      toast.showSuccess(t("layout.shared.copiedToClipboard"));
    } catch (error) {
      console.error("Error copying node ID to clipboard:", error);
      toast.showError(t("layout.shared.copyFailed"));
    }
  };

  return (
    <CollapsibleCard
      title={t("device.settings.deviceInfoTitle")}
      style={{
        ...globalStyles.shadowElevationForLightTheme,
        backgroundColor: tokens.colors.white,
      }}
    >
      <View style={globalStyles.infoContainer}>
        {/* Custom Node ID row with toast notification */}
        <View style={globalStyles.infoRow}>
          <Text style={globalStyles.infoLabel}>
            {t("device.settings.deviceInfoIdLabel")}:
          </Text>
          <View style={globalStyles.infoValue}>
            <Text>{node.id}</Text>
            <Copy
              size={20}
              color={tokens.colors.primary}
              onPress={handleCopyNodeId}
            />
          </View>
        </View>
        <InfoRow
          label={t("device.settings.deviceInfoVersionLabel")}
          value={nodeConfig?.info?.firmwareVersion || "--"}
        />
      </View>
    </CollapsibleCard>
  );
};

export default DeviceInfo;
