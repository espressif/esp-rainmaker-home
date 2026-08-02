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
  readMatterNodeIdFromCdfNode,
  readMatterSoftwareVersionFromCdfNode,
} from "@shared/utils/matterDeviceStateEvents";
import { ESPMatterControlAdapter } from "@native-adaptors/implementations/ESPMatterControlAdapter";

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

  // Only pure-Matter nodes lack a cloud firmwareVersion; they read it from the
  // Matter Basic Information cluster (0x28). Regular/hybrid nodes use the cloud value.
  const cloudFirmwareVersion = nodeConfig?.info?.firmwareVersion;
  const matterNodeId = node ? readMatterNodeIdFromCdfNode(node) : undefined;
  const isPureMatterNode = !!matterNodeId && !cloudFirmwareVersion;

  // Prefer the version persisted at commissioning; if nothing is stored (node
  // commissioned elsewhere / app reinstall) the effect below reads it live.
  const persistedMatterVersion =
    isPureMatterNode && node
      ? readMatterSoftwareVersionFromCdfNode(node)
      : undefined;
  const [fetchedMatterVersion, setFetchedMatterVersion] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    if (!isPureMatterNode || persistedMatterVersion || !matterNodeId) return;
    let cancelled = false;
    void (async () => {
      try {
        // SoftwareVersionString (0xA) for display; SoftwareVersion (0x9) numeric fallback.
        const asString = await ESPMatterControlAdapter.read(
          matterNodeId,
          0,
          0x28,
          0x0a,
        );
        if (
          !cancelled &&
          asString?.success &&
          typeof asString.value === "string" &&
          asString.value.trim()
        ) {
          setFetchedMatterVersion(asString.value.trim());
          return;
        }
        const asNumber = await ESPMatterControlAdapter.read(
          matterNodeId,
          0,
          0x28,
          0x09,
        );
        if (!cancelled && asNumber?.success && asNumber.value != null) {
          setFetchedMatterVersion(String(asNumber.value));
        }
      } catch {
        // leave the "--" fallback in place
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPureMatterNode, matterNodeId, persistedMatterVersion]);

  if (!node) return null;

  const matterVersion = persistedMatterVersion ?? fetchedMatterVersion;

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
          value={cloudFirmwareVersion || matterVersion || "--"}
        />

        {/* Timezone Row - Conditionally rendered based on device support */}
        <DeviceTimezone node={node} disabled={disabled} />
      </View>
    </CollapsibleCard>
  );
};;

export default DeviceInfo;
