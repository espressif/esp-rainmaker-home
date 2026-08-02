/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, ReactElement } from "react";
import { View, TouchableOpacity } from "react-native";

// Components
import { observer, useLocalObservable } from "mobx-react-lite";
import { Check } from "lucide-react-native";

// Hooks
import { useThrottle } from "@shared/hooks/useThrottle";
import { useToast } from "@shared/hooks/useToast";

// Types & Styles
import {
  ParamControlProps,
  getParamBounds,
  ParamControlChildProps,
} from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import { PARAM_CONTROL_THROTTLE_MS } from "@shared/utils/constants";

/**
 * ParamWrap
 *
 * Wrapper for scene/group/automation param controls. Updates local UI immediately;
 * persists or forwards values via a latest-wins throttle matching Device Control
 * (`PARAM_CONTROL_THROTTLE_MS`) so slider drags do not flood broadcasts/`setValue`.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @param showCheckbox - Whether to show selection checkbox
 * @param isSelected - Whether the parameter is selected
 * @param onSelect - Callback when selection changes
 * @param onValueChange - Optional parent forward path (e.g. group broadcast)
 * @returns Column with optional scene checkbox, throttled writes, and the nested param UI
 */
const ParamWrap = observer(
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
    const { min, max } = getParamBounds(param);
    const toast = useToast();
    const onValueChangeRef = useRef(onValueChange);
    onValueChangeRef.current = onValueChange;
    const paramRef = useRef(param);
    paramRef.current = param;

    const state = useLocalObservable(() => ({
      value: param.value,
      setValue: (value: unknown) => {
        state.value = value;
      },
    }));

    useEffect(() => {
      state.value = param.value;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
    }, [param.value]);

    const throttledForward = useThrottle(
      async (value: unknown) => {
        onValueChangeRef.current?.(value);
      },
      PARAM_CONTROL_THROTTLE_MS,
      {
        throttleWithLoading: true,
        setLoadingWhilePending: setUpdating,
      },
    );

    const throttledParamSetValue = useThrottle(
      async (value: unknown) => {
        await paramRef.current.setValue(value);
      },
      PARAM_CONTROL_THROTTLE_MS,
      {
        throttleWithLoading: true,
        setLoadingWhilePending: setUpdating,
      },
    );

    /**
     * Validates optional numeric bounds, updates local UI state, then throttles
     * either parent forward (`onValueChange`) or `param.setValue`.
     */
    const handleValueChange = async (
      _: unknown,
      newValue: unknown,
      validate: boolean = true,
    ) => {
      let nextValue = newValue;
      if (typeof nextValue === "number" && validate) {
        const roundedValue = Math.round(nextValue);
        if (roundedValue === state.value) return;
        if (roundedValue < min) {
          toast.showError("Value is below minimum");
          return;
        }
        if (roundedValue > max) {
          toast.showError("Value is above maximum");
          return;
        }
        nextValue = roundedValue;
      }

      if (disabled) return;

      state.setValue(nextValue);

      if (onValueChange) {
        throttledForward(nextValue);
      } else {
        throttledParamSetValue(nextValue);
      }
    };

    /**
     * Toggles scene/schedule selection checkbox when enabled.
     */
    const handleSelect = () => {
      if (onSelect && !disabled) {
        onSelect(!isSelected);
      }
    };

    /**
     * Clones child controls with local value + throttled change handler.
     */
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
            meta: {
              ...getParamBounds(param),
              dataType: param.dataType,
            },
          },
        );
      });
    };

    if (!showCheckbox) {
      return renderControl();
    }

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
  },
);

export default ParamWrap;
