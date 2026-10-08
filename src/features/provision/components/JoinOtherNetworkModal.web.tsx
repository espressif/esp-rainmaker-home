/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Input } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { flattenStyle } from "@shared/utils/flattenStyle";
import { testProps } from "@shared/utils/testProps";

/** Props for JoinOtherNetworkModal */
interface JoinOtherNetworkModalProps {
  /** Controls modal visibility */
  visible: boolean;
  /** Called when the user presses Cancel or taps the backdrop */
  onCancel: () => void;
  /**
   * Called when the user presses Connect with a non-empty SSID.
   * @param ssid - The manually entered network name.
   * @param password - Password typed by the user (empty string for open networks).
   */
  onConnect: (ssid: string, password: string) => void;
}

/**
 * Web dialog for manually joining a Wi-Fi network with flattened button styles.
 * @param props - Visibility, cancel handler, and connect callback.
 * @returns Centered modal to enter SSID and optional password.
 */
const JoinOtherNetworkModal: React.FC<JoinOtherNetworkModalProps> = ({
  visible,
  onCancel,
  onConnect,
}) => {
  const { t } = useTranslation();

  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [inputResetKey, setInputResetKey] = useState(0);
  const passwordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setSsid("");
      setPassword("");
      setInputResetKey((k) => k + 1);
    }
  }, [visible]);

  const isConnectDisabled = !ssid.trim();

  /**
   * Forward the trimmed SSID and raw password to the parent handler.
   */
  const handleConnect = () => {
    if (!ssid.trim()) return;
    onConnect(ssid.trim(), password);
  };

  return (
    <Modal
      {...testProps("modal_join_other_network_wifi")}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onCancel}
      >
        <TouchableOpacity
          style={styles.dialogContent}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.contentInner}>
            <Text
              style={flattenStyle([globalStyles.fontMedium, styles.dialogTitle])}
            >
              {t("device.wifi.joinOtherNetworkModal.title")}
            </Text>

            <Input
              key={`join-ssid-${inputResetKey}`}
              icon="wifi-outline"
              placeholder={t(
                "device.wifi.joinOtherNetworkModal.ssidInputPlaceholder",
              )}
              initialValue={ssid}
              onFieldChange={(value) => setSsid(value)}
              border={true}
              paddingHorizontal={false}
              marginBottom={true}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              qaId="ssid_join_network_wifi"
            />

            <Input
              ref={passwordInputRef}
              key={`join-pw-${inputResetKey}`}
              icon="lock-closed"
              isPassword={true}
              placeholder={t("device.wifi.password")}
              initialValue={password}
              onFieldChange={(value) => setPassword(value)}
              border={true}
              paddingHorizontal={false}
              marginBottom={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!isConnectDisabled) {
                  handleConnect();
                }
              }}
              qaId="password_join_network_wifi"
            />

            <View style={styles.dialogButtonRow}>
              <TouchableOpacity
                {...testProps("button_cancel_join_network_wifi")}
                onPress={onCancel}
                style={flattenStyle([styles.dialogButton, styles.cancelButton])}
              >
                <Text
                  style={flattenStyle([
                    globalStyles.fontMedium,
                    styles.cancelButtonText,
                  ])}
                >
                  {t("layout.shared.cancel")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                {...testProps("button_connect_join_network_wifi")}
                onPress={handleConnect}
                disabled={isConnectDisabled}
                style={flattenStyle([
                  styles.dialogButton,
                  styles.confirmButton,
                  isConnectDisabled && styles.buttonDisabled,
                ])}
              >
                <Text
                  style={flattenStyle([
                    globalStyles.fontMedium,
                    styles.confirmButtonText,
                  ])}
                >
                  {t("device.wifi.connect")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  dialogContent: {
    width: 320,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._20,
    shadowColor: tokens.colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  contentInner: {
    alignItems: "center",
    width: "100%",
  },
  dialogTitle: {
    fontSize: tokens.fontSize.lg,
    color: tokens.colors.black,
    marginBottom: tokens.spacing._15,
    marginTop: tokens.spacing._5,
    textAlign: "center",
    fontFamily: tokens.fonts.medium,
  },
  dialogButtonRow: {
    flexDirection: "row",
    width: "100%",
    gap: tokens.spacing._10,
    marginTop: tokens.spacing._15,
  },
  dialogButton: {
    flex: 1,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing._10,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: tokens.colors.bg2,
  },
  confirmButton: {
    backgroundColor: tokens.colors.blue,
  },
  cancelButtonText: {
    color: tokens.colors.text_secondary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
  confirmButtonText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export { JoinOtherNetworkModal };
