/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react-native";

import { ActionButton } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import { useDeviceAuthRefresh } from "@features/control/hooks";
import type { ESPCDFNode } from "@store";

interface DeviceAuthRefreshButtonProps {
  /** The CDF node whose auth token should be (re)pushed. */
  node: ESPCDFNode | undefined;
}

/**
 * On-demand "Refresh Token" button shown for any device that exposes a
 * refreshable auth service (`agent-auth` or `rmaker-user-auth`). Pushes the
 * signed-in user's current RainMaker refresh token to the device so its
 * firmware can mint access tokens. Mirrors the native app's device-screen
 * "Update RainMaker" affordance. Renders nothing when the node has no such
 * service.
 * @param props - Component props.
 * @param props.node - Node whose auth service receives the token.
 * @returns The button, or null when not applicable.
 */
function DeviceAuthRefreshButton({ node }: DeviceAuthRefreshButtonProps) {
  const { t } = useTranslation();
  const { hasAuthService, refreshing, refresh } = useDeviceAuthRefresh(node);

  if (!hasAuthService) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ActionButton
        variant="primary"
        onPress={refresh}
        disabled={refreshing}
        {...testProps("button_refresh_device_token")}
      >
        <View style={styles.content}>
          {refreshing ? (
            <ActivityIndicator size="small" color={tokens.colors.white} />
          ) : (
            <RefreshCw size={20} color={tokens.colors.white} />
          )}
          <Text style={[globalStyles.buttonText, globalStyles.buttonTextPrimary]}>
            {refreshing
              ? t("device.control.refreshingToken")
              : t("device.control.refreshToken")}
          </Text>
        </View>
      </ActionButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing._10,
  },
});

export default DeviceAuthRefreshButton;
