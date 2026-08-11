/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef } from "react";
import { View, Pressable, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { Edit3 } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ContentWrapper, Input } from "@shared/components";
import { testProps } from "@shared/utils/testProps";

interface ScheduleNameInputProps {
  scheduleName: string;
  onNameChange: (name: string) => void;
}

/**
 * Schedule name field with a pencil that focuses the input when pressed.
 * @param scheduleName - Current schedule name value
 * @param onNameChange - Called when the name text changes
 */
export const ScheduleNameInput = ({
  scheduleName,
  onNameChange,
}: ScheduleNameInputProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);

  /**
   * Focuses the schedule name input so the pencil acts as an edit affordance.
   */
  const focusNameInput = () => {
    inputRef.current?.focus();
  };

  return (
    <ContentWrapper
      title={t("schedule.createSchedule.scheduleName")}
      style={globalStyles.scheduleNameContentWrapper}
    >
      <View style={globalStyles.scheduleNameInputContainer}>
        <Input
          ref={inputRef}
          qaId="schedule_name"
          placeholder={t("schedule.createSchedule.scheduleNamePlaceholder")}
          value={scheduleName}
          onFieldChange={onNameChange}
          style={globalStyles.scheduleNameInput}
          border={false}
          paddingHorizontal={false}
          marginBottom={false}
        />
        <Pressable
          style={globalStyles.scheduleNameEditIcon}
          onPress={focusNameInput}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t("layout.shared.edit")}
          {...testProps("icon_edit_schedule_name")}
        >
          <Edit3 size={20} color={tokens.colors.text_secondary} />
        </Pressable>
      </View>
    </ContentWrapper>
  );
};
