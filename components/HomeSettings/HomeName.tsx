/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from "react";
import {
  Pressable,
  TextInput,
  ActivityIndicator,
  View,
  StyleSheet,
} from "react-native";
import { Edit3 } from "lucide-react-native";
import { useTranslation } from "react-i18next";

// Components
import ContentWrapper from "../Layout/ContentWrapper";
import Input from "../Form/Input";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// type
import { HomeNameProps } from "@/types/global";

/**
 * HomeName Component
 *
 * Displays and manages the home name editing functionality.
 * Provides input field and validation for home name changes.
 *
 * Features:
 * - Inline name editing
 * - Input validation
 * - Save state handling
 * - Primary user permissions
 *
 * @param props - Component properties for home name management
 */
const HomeName: React.FC<HomeNameProps> = ({
  homeName,
  setHomeName,
  onSave,
  isSaving,
  disabled,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);

  const handleSaveHomeName = () => {
    onSave();
  };

  /**
   * Validates home name before saving
   * Ensures name is not empty and triggers save
   */
  const homeNameValidator = (value: string) => {
    if (!value?.trim()) {
      return {
        isValid: false,
        error: t("group.validation.homeNameCannotBeEmpty"),
      };
    }
    return { isValid: true };
  };

  return (
    <ContentWrapper
      title={t("group.homeManagement.homeName")}
      style={styles.contentWrapper}
    >
      <Pressable
        style={[globalStyles.nameInputContainer]}
        onPress={() => inputRef.current?.focus()}
        disabled={disabled}
      >
        <Input
          ref={inputRef}
          value={homeName}
          onFieldChange={(value) => setHomeName(value)}
          validator={homeNameValidator}
          onBlur={handleSaveHomeName}
          validateOnBlur={true}
          placeholder={t("group.homeManagement.homeNamePlaceholder")}
          border={false}
          paddingHorizontal={false}
          marginBottom={false}
          editable={!disabled}
        />
        <View style={[globalStyles.editIcon]}>
          {isSaving ? (
            <ActivityIndicator size="small" color={tokens.colors.bg3} />
          ) : (
            <Edit3 size={20} color={tokens.colors.text_secondary} />
          )}
        </View>
      </Pressable>
    </ContentWrapper>
  );
};

const styles = StyleSheet.create({
  contentWrapper: {
    marginBottom: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    ...globalStyles.shadowElevationForLightTheme,
  },
});

export default HomeName;
