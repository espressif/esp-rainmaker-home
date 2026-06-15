/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  type TextInputProps,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

interface WifiPasswordInputProps
  extends Pick<TextInputProps, "returnKeyType" | "onSubmitEditing"> {
  password: string;
  showPassword: boolean;
  placeholder: string;
  onChangePassword: (password: string) => void;
  onToggleShowPassword: () => void;
}

/**
 * WifiPasswordInput Component
 *
 * Displays password input with visibility toggle
 */
export const WifiPasswordInput: React.FC<WifiPasswordInputProps> = ({
  password,
  showPassword,
  placeholder,
  onChangePassword,
  onToggleShowPassword,
  returnKeyType = "next",
  onSubmitEditing,
}) => (
  <View style={styles.passwordSection} {...testProps("view_wifi")}>
    <TextInput
      style={[
        styles.input,
        { borderRadius: tokens.radius.md },
        globalStyles.shadowElevationForLightTheme,
        globalStyles.settingsItemText,
      ]}
      placeholder={placeholder}
      value={password}
      onChangeText={onChangePassword}
      secureTextEntry={!showPassword}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      {...testProps("input_password")}
    />
    <TouchableOpacity
      style={styles.eyeIcon}
      {...testProps("button_toggle_password_wifi")}
      onPress={onToggleShowPassword}
    >
      {showPassword ? (
        <Eye size={20} color={tokens.colors.gray} />
      ) : (
        <EyeOff size={20} color={tokens.colors.gray} />
      )}
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  passwordSection: {
    width: "100%",
    gap: tokens.spacing._10,
  },
  input: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    paddingHorizontal: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.bg2,
  },
  eyeIcon: {
    position: "absolute",
    right: tokens.spacing._15,
    top: "50%",
    transform: [{ translateY: -10 }],
  },
});
