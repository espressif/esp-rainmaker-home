/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";

// Components
import { CollapsibleCard, InfoRow } from "@shared/components";
import DeviceTimezone from "./DeviceTimezone";

// Styles
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { Copy } from "lucide-react-native";

// Hooks
import { useToast } from "@shared/hooks/useToast";

// Types
import { DeviceInfoProps } from "@src/types/global";

// Utils
import {
  getStoredFirmwareVersion,
  needsLiveFirmwareRead,
  readLiveFirmwareVersion,
} from "@shared/utils/deviceFirmware";

/**
 * DeviceInfo Component
 *
 * Displays device information in a collapsible card format.
 * Shows device ID, version, and timezone (if available).
 * @param props - Component properties containing device information
 */
const DeviceInfo: React.FC<DeviceInfoProps> = ({ node, nodeConfig, disabled }) => {
  const { t } = useTranslation();
  const toast = useToast();

  // Most nodes carry the version in their cloud config; the rest need a live read.
  const storedVersion = getStoredFirmwareVersion(node, nodeConfig);
  const needsRead = needsLiveFirmwareRead(node, nodeConfig);
  const [liveVersion, setLiveVersion] = useState<string | undefined>(undefined);

  useEffect(() => {
    // `liveVersion` also gates it: node identity churns under MobX, and without
    // that guard every re-render would re-read a version we already have.
    if (!needsRead || liveVersion) return;
    let cancelled = false;
    void (async () => {
      try {
        const version = await readLiveFirmwareVersion(node);
        if (!cancelled && version) {
          setLiveVersion(version);
        }
      } catch {
        // leave the "--" fallback in place
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsRead, liveVersion, node]);

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
        {/* Node ID row with copy functionality */}
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

        {/* Firmware Version */}
        <InfoRow
          label={t("device.settings.deviceInfoVersionLabel")}
          value={storedVersion || liveVersion || "--"}
        />

        {/* Timezone Row - Conditionally rendered based on device support */}
        <DeviceTimezone node={node} disabled={disabled} />
      </View>
    </CollapsibleCard>
  );
};;

export default DeviceInfo;
