/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { ScheduleActionsHeaderProps } from "@/types/global";

const ScheduleActionsHeader = ({ onAddPress }: ScheduleActionsHeaderProps) => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.scheduleActionsHeader}>
      <Text style={globalStyles.scheduleActionsTitle}>
        {t("schedule.createSchedule.scheduleActions")}
      </Text>
      <View style={styles.buttonContainer}>
        <Pressable onPress={onAddPress} style={styles.addButton}>
          <Plus size={20} color={tokens.colors.text_secondary} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = {
  buttonContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: tokens.spacing._5,
  },
  syncButtonContent: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: tokens.spacing._5,
    margin: 0,
    padding: tokens.spacing._5,
    paddingHorizontal: tokens.spacing._15,
    backgroundColor: tokens.colors.bg1,
    borderRadius: tokens.radius.sm,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    color: tokens.colors.primary,
  },
  syncButtonTextDisabled: {
    color: tokens.colors.text_secondary,
  },
  addButton: {
    padding: tokens.spacing._5,
  },
};

export default ScheduleActionsHeader;
