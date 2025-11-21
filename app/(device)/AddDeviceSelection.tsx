/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import {
  Bluetooth,
  QrCode,
  ChevronRight,
  HouseWifi,
  AlertCircle,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";

// CDF
import { useCDF } from "@/hooks/useCDF";
import { observer } from "mobx-react-lite";

// Theme and Styles
import { tokens } from "@/theme/tokens";

// Components
import { ScreenWrapper, Header, Typo } from "@/components";
import { globalStyles } from "@/theme/globalStyleSheet";

// Utils
import { testProps } from "@/utils/testProps";

interface DeviceOption {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}

/**
 * AddDeviceSelection Component
 *
 * This component displays the device addition method selection screen
 * where users can choose between different provisioning methods.
 */
const AddDeviceSelection = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { store } = useCDF();
  const currentHome =
    store.groupStore._groupsByID[store.groupStore.currentHomeId];

  const deviceOptions: DeviceOption[] = [
    {
      icon: <QrCode {...testProps("icon_qr_code")} size={24} color={tokens.colors.primary} />,
      label: t("device.addDeviceSelection.qrOption"),
      description: t("device.addDeviceSelection.qrDescription"),
      onClick: () => router.push("/ScanQR"),
    },
    {
      icon: <Bluetooth {...testProps("icon_bluetooth")} size={24} color={tokens.colors.primary} />,
      label: t("device.addDeviceSelection.bluetoothOption"),
      description: t("device.addDeviceSelection.bluetoothDescription"),
      onClick: () => router.push("/ScanBLE"),
    },

  {
    icon: <HouseWifi {...testProps("icon_house_wifi")} size={24} color={tokens.colors.primary} />,
    label: t("device.addDeviceSelection.softAPOption"),
    description: t("device.addDeviceSelection.softAPDescription"),
    onClick: () => router.push("/ScanSoftAP")
  },
];

  const renderOptionCard = (option: DeviceOption) => (
    <TouchableOpacity
      key={option.label}
      style={styles.optionCard}
      {...testProps("button_add_device_selection")}
      onPress={option.onClick}
    >
      <View {...testProps("view_icon")} style={styles.iconContainer}>{option.icon}</View>
      <View {...testProps("view_text")} style={styles.textContainer}>
        <Typo variant="h3" style={styles.title} qaId="text_add_device_selection_title">
          {option.label}
        </Typo>
        <Typo variant="body" style={styles.description} qaId="text_add_device_selection_description">
          {option.description}
        </Typo>
      </View>
      <ChevronRight size={20} color={tokens.colors.gray} />
    </TouchableOpacity>
  );

  const renderNonPrimaryUserCard = () => {
    const homeName = currentHome?.name || t("device.addDeviceSelection.defaultHomeName");

    return (
      <View
        style={[
          globalStyles.emptyStateContainer,
          { borderRadius: tokens.radius.md },
        ]}
      >
        <View style={globalStyles.emptyStateIconContainer}>
          <AlertCircle size={48} color={tokens.colors.primary} />
        </View>
        <View>
          <Typo variant="h2" style={globalStyles.emptyStateTitle}>
            {t("device.addDeviceSelection.sharedHomeRestriction")}
          </Typo>
          <Typo variant="body" style={globalStyles.emptyStateDescription}>
            {t("device.addDeviceSelection.sharedHomeMessage", { homeName })}
          </Typo>
        </View>
      </View>
    );
  };

  return (
    <>
      <Header label={t("device.addDeviceSelection.title")} qaId="header_add_device_selection" />
      <ScreenWrapper style={styles.container} qaId="screen_wrapper_add_device_selection">
        {currentHome.isPrimaryUser ? (
          <>
            <Typo variant="body" style={styles.noteText} qaId="text_add_device_selection_note">
              {t("device.addDeviceSelection.note")}
            </Typo>
            {deviceOptions.map(renderOptionCard)}
          </>
        ) : (
          renderNonPrimaryUserCard()
        )}
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: tokens.spacing._15,
    backgroundColor: tokens.colors.bg5,
  },
  noteText: {
    color: tokens.colors.text_secondary,
    marginBottom: tokens.spacing._20,
    paddingHorizontal: tokens.spacing._5,
    fontSize: tokens.fontSize.md,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._15,
    marginBottom: tokens.spacing._10,
    ...globalStyles.shadowElevationForLightTheme,
  },
  iconContainer: {
    width: 40,
    height: 40,
    backgroundColor: tokens.colors.bg1,
    borderRadius: tokens.radius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
    marginLeft: tokens.spacing._15,
  },
  title: {
    color: tokens.colors.text_primary,
    fontSize: tokens.fontSize.md,
    marginBottom: 2,
  },
  description: {
    color: tokens.colors.text_secondary,
    fontSize: tokens.fontSize.sm,
  },
});

export default observer(AddDeviceSelection);
