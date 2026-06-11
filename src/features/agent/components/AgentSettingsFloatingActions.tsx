/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet, Pressable, View } from "react-native";
import { Plus, QrCode } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

interface AgentSettingsFloatingActionsProps {
  /** Opens the add-agent bottom sheet. */
  onAddPress: () => void;
  /** Opens the agent QR scanner screen. */
  onScanPress: () => void;
}

/**
 * Floating scan and add controls for agent Settings (circular buttons, bottom-right).
 */
export function AgentSettingsFloatingActions({
  onAddPress,
  onScanPress,
}: AgentSettingsFloatingActionsProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.row, { bottom: tokens.spacing._20 + insets.bottom }]}
    >
      <Pressable
        {...testProps("button_scan_agent_floating")}
        onPress={onScanPress}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={t("aiSettings.scan.scanAgent")}
      >
        <QrCode size={26} color={tokens.colors.white} />
      </Pressable>
      <Pressable
        {...testProps("button_add_agent_floating")}
        onPress={onAddPress}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={t("aiSettings.scan.addAgent")}
      >
        <Plus size={28} color={tokens.colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    right: tokens.spacing._20,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
    zIndex: 1000,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: tokens.colors.text_primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
