/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from "react";
import { View, Pressable, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { Edit3 } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { ContentWrapper, Input } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import { createAutomationStyles as styles } from "../../theme/createAutomationStyles";

export interface CreateAutomationNameSectionProps {
  title: string;
  placeholder: string;
  value: string;
  onNameChange: (name: string) => void;
}

/**
 * Create-automation name field with a pencil that focuses the input when pressed.
 * @param title - Section title shown above the field
 * @param placeholder - Placeholder for the name input
 * @param value - Current automation name
 * @param onNameChange - Called when the name text changes
 */
export const CreateAutomationNameSection: React.FC<
  CreateAutomationNameSectionProps
> = ({ title, placeholder, value, onNameChange }) => {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);

  /**
   * Focuses the automation name input so the pencil acts as an edit affordance.
   */
  const focusNameInput = () => {
    inputRef.current?.focus();
  };

  return (
    <ContentWrapper
      qaId="automation_name"
      title={title}
      style={{
        ...styles.contentWrapper,
        ...styles.section,
      }}
    >
      <View style={styles.inputContainer}>
        <Input
          ref={inputRef}
          qaId="automation_name"
          placeholder={placeholder}
          value={value}
          onFieldChange={onNameChange}
          style={styles.input}
          border={false}
          paddingHorizontal={false}
          marginBottom={false}
        />
        <Pressable
          style={styles.editIcon}
          onPress={focusNameInput}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t("layout.shared.edit")}
          {...testProps("icon_edit_automation_name")}
        >
          <Edit3 size={20} color={tokens.colors.text_secondary} />
        </Pressable>
      </View>
    </ContentWrapper>
  );
};
