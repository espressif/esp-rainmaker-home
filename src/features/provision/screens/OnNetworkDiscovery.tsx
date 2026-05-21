/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react-native";

// Theme & styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Components
import { Header, ScreenWrapper, ContentWrapper } from "@shared/components";
import {
  OnNetworkDeviceCard,
  ScanningAnimation,
  NoDevicesFound,
} from "@features/provision/components";

// Hooks
import { useOnNetworkDiscovery } from "@features/provision/hooks";

// Utils
import { testProps } from "@shared/utils/testProps";

/**
 * OnNetworkDiscovery
 *
 * Screen the user lands on after picking the "On Network" entry in
 * AddDeviceSelection. It runs a single mDNS scan window on mount, lists
 * devices on the same Wi-Fi that advertise the chal-resp endpoint, and routes
 * the chosen device into either the POP screen (when `pop_required`) or
 * directly into the simplified (no-Wi-Fi-credentials) provisioning flow.
 *
 * Re-scan is user-driven: tap the refresh icon next to the title or pull the
 * device list to refresh. The native mDNS browser is stopped between scans to
 * avoid background polling and to release the single-browser slot for the
 * SDK's local-control discovery.
 * @returns Header + scan-state body (loading / list / empty).
 */
const OnNetworkDiscovery = () => {
  const { t } = useTranslation();
  const { isScanning, devices, rescan, selectDevice } =
    useOnNetworkDiscovery();

  /** Compact refresh affordance reused by both the loading and list states. */
  const refreshButton = (
    <TouchableOpacity
      {...testProps("button_rescan_on_network")}
      onPress={rescan}
      disabled={isScanning}
      style={styles.rescanButton}
    >
      <RotateCcw
        size={20}
        color={
          isScanning ? tokens.colors.text_secondary : tokens.colors.primary
        }
      />
    </TouchableOpacity>
  );

  return (
    <>
      <Header
        showBack
        label={t("device.onNetwork.title")}
        qaId="header_on_network_discovery"
      />
      <ScreenWrapper
        style={globalStyles.scanContainer}
        qaId="screen_wrapper_on_network_discovery"
      >
        {isScanning ? (
          <ContentWrapper
            title={t("device.onNetwork.scanning")}
            style={globalStyles.shadowElevationForLightTheme}
            qaId="scanning_devices_on_network"
          >
            <ScanningAnimation />
          </ContentWrapper>
        ) : devices.length > 0 ? (
          <ContentWrapper
            title={t("device.onNetwork.devicesFound", {
              count: devices.length,
            })}
            leftSlot={refreshButton}
            style={globalStyles.shadowElevationForLightTheme}
            qaId="devices_found_on_network"
          >
            <ScrollView
              {...testProps("scroll_on_network")}
              style={globalStyles.scannedDevicesList}
              refreshControl={
                <RefreshControl
                  refreshing={isScanning}
                  onRefresh={rescan}
                  tintColor={tokens.colors.primary}
                  colors={[tokens.colors.primary]}
                />
              }
            >
              {devices.map((device) => (
                <OnNetworkDeviceCard
                  key={device.nodeId}
                  serviceName={device.serviceName || device.nodeId}
                  nodeId={device.nodeId}
                  popRequired={device.popRequired}
                  onPress={() => selectDevice(device)}
                />
              ))}
            </ScrollView>
          </ContentWrapper>
        ) : (
          <NoDevicesFound
            onScanAgain={rescan}
            title={t("device.onNetwork.noDevicesFound")}
            message={t("device.onNetwork.noDevicesMessage")}
            style={globalStyles.shadowElevationForLightTheme}
          />
        )}
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  rescanButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default OnNetworkDiscovery;
