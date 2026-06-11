/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Clock, Hourglass } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import {
  SCHEDULE_TRIGGER_MODE_FIXED,
  SCHEDULE_TRIGGER_MODE_RELATIVE,
} from "@shared/utils/constants";
import type {
  ScheduleTriggerMode,
  ScheduleTriggerTypeSelectorProps,
} from "@src/types/global";

const TRIGGER_ICON_SIZE = tokens.iconSize._15;

type TriggerOption = {
  mode: ScheduleTriggerMode;
  labelKey: "schedule.time.fixedTime" | "schedule.time.afterDelay";
  Icon: LucideIcon;
};

const TRIGGER_OPTIONS: TriggerOption[] = [
  {
    mode: SCHEDULE_TRIGGER_MODE_FIXED,
    labelKey: "schedule.time.fixedTime",
    Icon: Clock,
  },
  {
    mode: SCHEDULE_TRIGGER_MODE_RELATIVE,
    labelKey: "schedule.time.afterDelay",
    Icon: Hourglass,
  },
];

/**
 * Pill-style segmented control for fixed clock-time vs relative delay triggers.
 * Renders icon + label segments on a light track with an elevated white active chip.
 */
const ScheduleTriggerTypeSelector = ({
  mode,
  onModeChange,
}: ScheduleTriggerTypeSelectorProps) => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.scheduleRow}>
      <Text style={globalStyles.scheduleSectionTitle}>
        {t("schedule.time.triggerType")}
      </Text>
      <View style={globalStyles.scheduleTriggerTypeContainer}>
        {TRIGGER_OPTIONS.map(({ mode: optionMode, labelKey, Icon }) => {
          const isActive = mode === optionMode;
          const iconColor = isActive
            ? tokens.colors.text_primary
            : tokens.colors.text_secondary;

          return (
            <Pressable
              key={optionMode}
              style={[
                globalStyles.scheduleTriggerTypeButton,
                isActive && globalStyles.scheduleTriggerTypeButtonActive,
              ]}
              onPress={() => onModeChange(optionMode)}
            >
              <Icon size={TRIGGER_ICON_SIZE} color={iconColor} />
              <Text
                style={[
                  globalStyles.scheduleTriggerTypeText,
                  isActive && globalStyles.scheduleTriggerTypeTextActive,
                ]}
              >
                {t(labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export default ScheduleTriggerTypeSelector;
