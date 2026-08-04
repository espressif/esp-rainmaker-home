/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Modal, View, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { Input, Button } from "@shared/components";
import { testProps } from "@shared/utils/testProps";

interface WifiResetRetryDialogProps {
  open: boolean;
  /** SSID being retried; titles the dialog so the user knows which network. */
  ssid: string;
  isRetrying?: boolean;
  onRetry: (password: string) => void;
  onCancel: () => void;
}

/**
 * Collects the corrected Wi-Fi password, after the user has already agreed to
 * retry. Only the password is asked for: the SSID is known from the first
 * attempt and the association survives the reset, so nothing else changes.
 * @param props - Dialog visibility, SSID and the retry / cancel handlers.
 */
export const WifiResetRetryDialog = ({
  open,
  ssid,
  isRetrying = false,
  onRetry,
  onCancel,
}: WifiResetRetryDialogProps) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");

  const handleRetry = () => {
    if (!password) {
      return;
    }
    onRetry(password);
    setPassword("");
  };

  const handleCancel = () => {
    setPassword("");
    onCancel();
  };

  return (
    <Modal
      {...testProps("dialog_wifi_reset_retry")}
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={globalStyles.modalOverlay}>
        <View style={globalStyles.modalContent}>
          <Text
            {...testProps("text_title_wifi_reset_retry")}
            style={globalStyles.modalTitle}
          >
            {ssid}
          </Text>
          <Text
            {...testProps("text_message_wifi_reset_retry")}
            style={globalStyles.modalDescription}
          >
            {t("device.provision.wifiResetPasswordMessage")}
          </Text>

          <Input
            icon="lock-closed"
            isPassword
            placeholder={t("device.provision.wifiResetPasswordPlaceholder")}
            onFieldChange={(value) => setPassword(value)}
            returnKeyType="go"
            onSubmitEditing={handleRetry}
            qaId="wifi_reset_password"
          />

          <Button
            label={t("device.provision.wifiResetPasswordSubmit")}
            onPress={handleRetry}
            disabled={!password || isRetrying}
            isLoading={isRetrying}
            style={{ ...globalStyles.btn, ...globalStyles.bgBlue }}
            qaId="button_wifi_reset_retry"
          />
          <Button
            label={t("layout.shared.cancel")}
            onPress={handleCancel}
            style={{ ...globalStyles.btn, ...globalStyles.btnSecondary }}
            textStyle={{ color: tokens.colors.primary }}
            qaId="button_wifi_reset_cancel"
          />
        </View>
      </View>
    </Modal>
  );
};
