/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  Modal,
  FlatList,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { RotateCcw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { NetworkListModalProps } from "@src/types/global";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { WifiItem } from "./WifiItem";
import { createNetworkKey } from "@features/provision/utils/wifiHelper";
import { testProps } from "@shared/utils/testProps";

/**
 * NetworkListModal Component
 *
 * Displays a modal with list of available WiFi networks
 */
export const NetworkListModal: React.FC<NetworkListModalProps> = ({
  visible,
  onClose,
  wifiList,
  lastUsedSsid,
  onSelect,
  isLoading,
  onRefresh,
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      {...testProps("modal_wifi")}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={onClose}
          {...testProps("button_close_wifi")}
        />
        <View style={styles.modalContent} {...testProps("view_wifi")}>
          <View style={styles.modalHandle} {...testProps("view_wifi_modal_handle")} />

          <View style={styles.modalHeader} {...testProps("view_wifi")}>
            <Text style={styles.modalTitle} {...testProps("text_title_wifi")}>
              {t("device.wifi.availableNetworks")}
            </Text>
            <View style={styles.modalActions} {...testProps("view_wifi")}>
              {isLoading ? (
                <ActivityIndicator color={tokens.colors.primary} />
              ) : (
                <TouchableOpacity
                  onPress={onRefresh}
                  {...testProps("button_refresh_wifi")}
                  style={styles.refreshButton}
                >
                  <RotateCcw size={16} color={tokens.colors.primary} />
                  <Text style={styles.refreshText} {...testProps("text_refresh_wifi")}>
                    {t("layout.shared.refresh")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <FlatList
            data={wifiList}
            renderItem={({ item }) => (
              <WifiItem
                item={item}
                onSelect={onSelect}
                isLastUsed={item.ssid === lastUsedSsid}
              />
            )}
            keyExtractor={(item, index) =>
              createNetworkKey(item.ssid, item.rssi, index)
            }
            ItemSeparatorComponent={() => (
              <View style={globalStyles.settingsItemSeparator} {...testProps("view_wifi")}/>
            )}
            style={styles.wifiList}
            contentContainerStyle={styles.wifiListContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: tokens.spacing._10,
    maxHeight: "80%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: tokens.spacing._15,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: tokens.spacing._20,
    paddingBottom: tokens.spacing._15,
  },
  modalTitle: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
  },
  refreshText: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },
  wifiList: {
    maxHeight: "100%",
  },
  wifiListContent: {
    paddingHorizontal: tokens.spacing._20,
    paddingBottom: tokens.spacing._20,
  },
});
