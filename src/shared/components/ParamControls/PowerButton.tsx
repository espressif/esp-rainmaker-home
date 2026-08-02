/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { TouchableOpacity, View } from "react-native";

// Styles
import { tokens } from "@shared/theme/tokens";
import { paramControlStyles as styles } from "./lib/styles";

// Icons
import { Power } from "lucide-react-native";

// Types
import { ParamControlChildProps } from "./lib/types";
import { observer } from "mobx-react-lite";
import { testProps } from "@shared/utils/testProps";
import { coerceParamValueToBoolean } from "@shared/utils/paramUtils";

/**
 * PowerButton
 *
 * A realistic circular power button component that toggles between on/off states.
 * Provides visual feedback through color, shadows, and style changes to mimic real hardware.
 * When disabled (e.g. offline), shadows/glow are cleared so Android elevation + parent
 * opacity does not render a faceted halo around the circle.
 * @param param - The parameter object containing value and setValue function
 * @param disabled - Optional flag to disable the control
 * @returns Large circular power affordance with on/off styling and icon
 */
const PowerButton = observer(
  ({ value, onValueChange, disabled }: ParamControlChildProps) => {
    const isOn = coerceParamValueToBoolean(value);
    const size = 120;
    /** Offline / disabled: plain circle, no glow or elevation shadow. */
    const showActiveChrome = isOn && !disabled;

    /**
     * Toggles power when the control is writable.
     */
    const handlePress = async () => {
      if (disabled || !onValueChange) return;
      onValueChange(null, !isOn);
    };

    // Render
    return (
      <View style={styles.powerButtonWrapper}>
        {/* Outer glow only when ON and interactive — elevation under opacity looks faceted. */}
        {showActiveChrome && (
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
          {...testProps("button_power_control")}
          style={[
            styles.powerButton,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
            showActiveChrome && styles.powerButtonActive,
            disabled && styles.powerButtonDisabled,
          ]}
          onPress={handlePress}
          activeOpacity={0.8}
          disabled={disabled}
        >
          {/* Inner button surface */}
          <View
            {...testProps(`power_state_${isOn ? "on" : "off"}`)}
            style={[
              styles.powerButtonInner,
              {
                width: size - 8,
                height: size - 8,
                borderRadius: (size - 8) / 2,
              },
              showActiveChrome && styles.powerButtonInnerActive,
              disabled && styles.powerButtonInnerDisabled,
            ]}
          >
            {/* Power icon */}
            <Power
              {...testProps("icon_power_control")}
              size={size * 0.4}
              color={
                showActiveChrome ? tokens.colors.white : tokens.colors.gray
              }
              strokeWidth={3}
            />
          </View>
        </TouchableOpacity>
      </View>
    );
  },
);

export default PowerButton;
