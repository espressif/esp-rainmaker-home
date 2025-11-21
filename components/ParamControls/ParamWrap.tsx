/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, ReactElement } from "react";
import { View, TouchableOpacity } from "react-native";

// Components
import { observer, useLocalObservable } from "mobx-react-lite";
import { Check } from "lucide-react-native";

// Hooks
import { useThrottle } from "@/hooks/useThrottle";
import { useToast } from "@/hooks/useToast";

// Types & Styles
import {
  ParamControlProps,
  getParamBounds,
  ParamControlChildProps,
} from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { tokens } from "@/theme/tokens";
import { testProps } from "@/utils/testProps";

/**
 * ParamControlWrap
 *
 * A wrapper component for controlling device parameter.
 * Provides common functionality like value validation, error handling,
 * and optional checkbox selection for scene creation.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @param showCheckbox - Whether to show selection checkbox
 * @param isSelected - Whether the parameter is selected
 * @param onSelect - Callback when selection changes
 * @returns JSX component for parameter control wrapper
 */
const ParamControlWrap = observer(
  ({
    param,
    disabled = false,
    setUpdating,
    showCheckbox = false,
    isSelected = false,
    onSelect,
    children,
    onValueChange,
    qaId,
  }: ParamControlProps & { qaId?: string }) => {
    // 1. Computed Values
    const { min, max, step = 1, ...rest } = getParamBounds(param);
    const toast = useToast();
    const state = useLocalObservable(() => ({
      value: param.value,
      setValue: (value: number) => {
        state.value = value;
      },
    }));

    useEffect(() => {
      state.value = param.value;
    }, [param.value]);

    // 2. Handlers
    const handleValueChange = async (
      _: any,
      newValue: any,
      validate: boolean = true
    ) => {
      // update value if not forwarded to parent
      if (typeof newValue == "number" && validate) {
        const roundedValue = Math.round(newValue);
        if (roundedValue === state.value) return;
        if (roundedValue < min) {
          toast.showError("Value is below minimum");
          return;
        }
        if (roundedValue > max) {
          toast.showError("Value is above maximum");
          return;
        }
        newValue = roundedValue;
      }

      setUpdating(true);
      if (disabled) return;
      if (onValueChange) {
        // forward value to parent
        onValueChange(newValue);
        setTimeout(() => setUpdating(false), 100);
      } else {
        state.setValue(newValue);
        throttledValueChange();
      }
    };

    const throttledValueChange = useThrottle(async () => {
      await param.setValue(state.value);
      setTimeout(() => setUpdating(false), 100);
    }, 100);

    const handleSelect = () => {
      if (onSelect && !disabled) {
        onSelect(!isSelected);
      }
    };

    // 3. Render
    const renderControl = () => {
      return React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(
          child as ReactElement<ParamControlChildProps>,
          {
            ...testProps(`param_${param.name}_control`),
            label: param.name,
            value: state.value,
            onValueChange: handleValueChange,
            disabled: disabled,
            meta: getParamBounds(param),
          }
        );
      });
    };

    // If no checkbox is needed, render control directly
    if (!showCheckbox) {
      return renderControl();
    }

    // Render with checkbox when in selection mode
    return (
      <View {...(qaId ? testProps(`view_${qaId}`) : {})}>
        <TouchableOpacity
          {...(qaId ? testProps(`button_${qaId}`) : {})}
          onPress={handleSelect}
          style={[styles.controlRow]}
          activeOpacity={disabled ? 1 : 0.8}
          disabled={disabled}
        >
          <View
            style={[
              styles.checkbox,
              isSelected && !disabled && styles.checkboxSelected,
              disabled && styles.checkboxDisabled,
            ]}
          >
            <Check
              {...(qaId ? testProps(`icon_${qaId}`) : {})}
              size={12}
              color={tokens.colors.white}
              opacity={isSelected && !disabled ? 1 : 0}
            />
          </View>
          <View
            {...(qaId ? testProps(`view_control_${qaId}`) : {})}
            style={[
              styles.controlContainer,
              disabled && styles.controlContainerDisabled,
            ]}
          >
            {renderControl()}
          </View>
        </TouchableOpacity>
      </View>
    );
  }
);

export default ParamControlWrap;
