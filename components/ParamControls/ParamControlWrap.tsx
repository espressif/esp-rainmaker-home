/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, ReactElement } from "react";
import { View, GestureResponderEvent } from "react-native";

// Components
import { observer, useLocalObservable } from "mobx-react-lite";

// Hooks
import { useThrottle } from "@/hooks/useThrottle";
import { useToast } from "@/hooks/useToast";

// Types & Styles
import {
  ParamControlProps,
  getParamBounds,
  ParamControlChildProps,
} from "./lib/types";

/**
 * ParamControlWrap
 *
 * A wrapper component for controlling device parameter.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns JSX component for brightness control
 */
const ParamControlWrap = observer(
  ({
    param,
    disabled = false,
    setUpdating,
    children,
    style,
  }: ParamControlProps) => {
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
      event: GestureResponderEvent | null,
      newValue: any,
      validate: boolean = true
    ) => {
      setUpdating(true);
      if (disabled) return;
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
      state.setValue(newValue);
      throttledValueChange();
    };

    const throttledValueChange = useThrottle(async () => {
      await param.setValue(state.value);
      setTimeout(() => setUpdating(false), 100);
    }, 100);

    // 3. Render
    return (
      <View style={[style]}>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(
            child as ReactElement<ParamControlChildProps>,
            {
              label: param.name,
              value: state.value,
              onValueChange: handleValueChange,
              disabled: disabled,
              meta: getParamBounds(param),
            }
          );
        })}
      </View>
    );
  }
);

export default ParamControlWrap;
