/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react-native";
import { useAddDeviceNavigation } from "@features/provision/hooks";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

/**
 * ScheduleDeviceSelectionEmptyState Component
 *
 * Displays empty state when no devices are available for schedule selection.
 */
export const ScheduleDeviceSelectionEmptyState = () => {
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
      <View style={globalStyles.sceneEmptyStateIconContainer}>
        <Pressable onPress={goToAddDevice}>
          <Plus size={35} color={tokens.colors.primary} />
        </Pressable>
      </View>
      <Text style={globalStyles.emptyStateTitle}>
        {t("schedule.deviceSelection.noDevicesAvailable")}
      </Text>
    </View>
  );
};
