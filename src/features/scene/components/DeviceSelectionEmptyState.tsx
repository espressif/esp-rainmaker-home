/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";
import { Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useAddDeviceNavigation } from "@features/provision/hooks";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

/**
 * DeviceSelectionEmptyState Component
 *
 * Displays an empty state when no devices are available for selection
 * Shows an add device button to navigate to device addition screen
 */
export default function DeviceSelectionEmptyState() {
  const goToAddDevice = useAddDeviceNavigation();
  const { t } = useTranslation();

  return (
    <View
      style={[
        globalStyles.sceneEmptyStateContainer,
        {
          justifyContent: "center",
        },
      ]}
    >
      <View {...testProps("view_empty_devices_selection")} style={globalStyles.sceneEmptyStateIconContainer}>
        <Pressable {...testProps("button_add_device_selection")} onPress={goToAddDevice}>
          <Plus size={35} color={tokens.colors.primary} />
        </Pressable>
      </View>
      <Text {...testProps("text_no_devices_available")} style={globalStyles.emptyStateTitle}>
        {t("scene.deviceSelection.noDevicesAvailable")}
      </Text>
    </View>
  );
}
