/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, TouchableOpacity } from "react-native";

import { paramControlStyles as styles } from "./lib/styles";
import { ParamControlChildProps } from "./lib/types";
import { PARAM_CONTROL_INVOKE_VALUE } from "@shared/utils/constants";
import { tokens } from "@shared/theme/tokens";

/**
 * ActionButton
 *
 * Generic one-shot command param control. SDK adaptors map `setValue("invoke")` to protocol commands.
 * @param label - Command label shown on the button.
 * @param onValueChange - Persists {@link PARAM_CONTROL_INVOKE_VALUE} via `param.setValue`.
 * @param disabled - When true, the button is inactive.
 * @returns Single-action command button.
 */
const ActionButton = ({
  label,
  onValueChange,
  disabled,
}: ParamControlChildProps) => {
  /**
   * Sends the generic invoke token to the param write path.
   */
  const handlePress = () => {
    if (disabled) {
      return;
    }
    onValueChange?.(null, PARAM_CONTROL_INVOKE_VALUE);
  };

  return (
    <View
      style={[
        styles.container,
        styles.containerCompact,
        disabled && styles.disabled,
      ]}
    >
      <TouchableOpacity
        style={[
          styles.pushButton,
          !disabled && { backgroundColor: tokens.colors.primary },
          disabled && styles.disabled,
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <Text
          style={[styles.pushButtonText, !disabled && styles.pushButtonTextActive]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default ActionButton;
