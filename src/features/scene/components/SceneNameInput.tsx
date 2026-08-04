/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef } from "react";
import { View, StyleSheet, Pressable, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { Edit3 } from "lucide-react-native";
import { Input, ContentWrapper } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

type SceneNameInputProps = {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  title: string;
  qaId?: string;
};

/**
 * Scene name field with a pencil that focuses the input when pressed.
 * Used on Create Scene, Edit Scene, and related screens.
 * @param value - Current scene name
 * @param onChange - Called when the name text changes
 * @param placeholder - Placeholder for the name input
 * @param title - Section title shown above the field
 * @param qaId - Optional QA id for the section and input
 */
export default function SceneNameInput({
  value,
  onChange,
  placeholder,
  title,
  qaId = "scene_name",
}: SceneNameInputProps) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);

  /**
   * Focuses the scene name input so the pencil acts as an edit affordance.
   */
  const focusNameInput = () => {
    inputRef.current?.focus();
  };

  return (
    <ContentWrapper qaId={qaId} title={title} style={styles.contentWrapper}>
      <View style={styles.inputContainer}>
        <Input
          ref={inputRef}
          qaId={qaId}
          placeholder={placeholder}
          value={value}
          onFieldChange={onChange}
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
          {...testProps("icon_edit_scene_name")}
        >
          <Edit3 size={20} color={tokens.colors.text_secondary} />
        </Pressable>
      </View>
    </ContentWrapper>
  );
}

const styles = StyleSheet.create({
  contentWrapper: {
    backgroundColor: tokens.colors.white,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: tokens.spacing._10,
  },
  input: {
    flex: 1,
    paddingRight: tokens.spacing._40,
  },
  editIcon: {
    top: tokens.spacing._10,
    position: "absolute",
    right: 0,
  },
});
