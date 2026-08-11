/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
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
import { ContentWrapper, Input } from "@shared/components";

// Styles
import { tokens } from "@shared/theme/tokens";

// Types
import { DeviceNameProps } from "@src/types/global";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

/**
 * DeviceName Component
 *
 * Displays and manages the device name editing functionality.
 * Provides input field and validation for device name changes.
 *
 * Features:
 * - Inline name editing
 * - Input validation
 * - Save state handling
 * @param props - Component properties for device name management
 */
const DeviceName: React.FC<DeviceNameProps> = ({
  initialDeviceName,
  deviceName,
  setDeviceName,
  setIsEditingName,
  onSave,
  isSaving,
  disabled,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);

  /**
   * Triggers persist when the field blurs or the keyboard Done key is pressed.
   */
  const handleSaveDeviceName = () => {
    if (disabled || isSaving) {
      return;
    }
    void onSave();
  };

  /**
   * Marks the field as editing so store sync cannot overwrite the draft.
   */
  const handleFocus = () => {
    setIsEditingName(true);
  };

  /**
   * Validates device name before saving
   * Ensures name is not empty and triggers save
   * @param value - Candidate device name
   * @returns Validation result for the Input control
   */
  const deviceNameValidator = (value: string) => {
    if (!value?.trim()) {
      return {
        isValid: false,
        error: t("device.validation.deviceNameCannotBeEmpty"),
      };
    }
    return { isValid: true };
  };

  return (
    <ContentWrapper
      title={t("device.settings.deviceNameTitle")}
      scrollContent={false}
      style={{
        marginBottom: tokens.spacing._15,
        ...globalStyles.shadowElevationForLightTheme,
        backgroundColor: tokens.colors.white,
      }}
      contentStyle={{ paddingBottom: tokens.spacing._5 }}
      qaId="device_name"
    >
      <Pressable
        style={[styles.inputContainer]}
        onPress={() => inputRef.current?.focus()}
        disabled={disabled}
        {...testProps("button_edit_device_name")}
      >
        <Input
          ref={inputRef}
          initialValue={initialDeviceName}
          value={deviceName}
          onFieldChange={(value) => setDeviceName(value)}
          validator={deviceNameValidator}
          onFocus={handleFocus}
          onBlur={handleSaveDeviceName}
          validateOnBlur={true}
          placeholder={t("device.settings.enterDeviceNamePlaceholder")}
          border={false}
          paddingHorizontal={false}
          marginBottom={false}
          editable={!disabled}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (deviceName?.trim() && !disabled && !isSaving) {
              handleSaveDeviceName();
            }
          }}
          qaId="device_name"
        />
        <View style={[styles.editIcon]}>
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

export default DeviceName;
