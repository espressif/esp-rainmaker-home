/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { TouchableOpacity, View } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { paramControlStyles as styles } from "./lib/styles";

// Icons
import { Power } from "lucide-react-native";

// Types
import { ParamControlChildProps } from "./lib/types";
import { observer } from "mobx-react-lite";

/**
 * PowerButton
 *
 * A realistic circular power button component that toggles between on/off states.
 * Provides visual feedback through color, shadows, and style changes to mimic real hardware.
 *
 * @param param - The parameter object containing value and setValue function
 * @param disabled - Optional flag to disable the control
 * @returns JSX component
 */
const PowerButton = observer(
  ({ value, onValueChange, disabled }: ParamControlChildProps) => {
    const isOn = Boolean(value);
    const size = 120;
    // Handlers
    const handlePress = async () => {
      if (disabled || !onValueChange) return;
      onValueChange(null, !isOn);
    };

    // Render
    return (
      <View style={styles.powerButtonWrapper}>
        {/* Outer glow effect when ON */}
        {isOn && (
          <View
            style={[
              styles.powerButtonGlow,
              {
                width: size + 20,
                height: size + 20,
                borderRadius: (size + 20) / 2,
              },
            ]}
          />
        )}

        {/* Main button container */}
        <TouchableOpacity
          style={[
            styles.powerButton,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
            isOn && styles.powerButtonActive,
            disabled && styles.disabled,
          ]}
          onPress={handlePress}
          activeOpacity={0.8}
          disabled={disabled}
        >
          {/* Inner button surface */}
          <View
            style={[
              styles.powerButtonInner,
              {
                width: size - 8,
                height: size - 8,
                borderRadius: (size - 8) / 2,
              },
              isOn && styles.powerButtonInnerActive,
            ]}
          >
            {/* Power icon */}
            <Power
              size={size * 0.4}
              color={isOn ? tokens.colors.white : tokens.colors.gray}
              strokeWidth={3}
            />
          </View>
        </TouchableOpacity>
      </View>
    );
  }
);

export default PowerButton;
