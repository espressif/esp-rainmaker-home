/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ReactElement, useEffect, useMemo, useRef } from "react";
import { View, GestureResponderEvent } from "react-native";

import { observer, useLocalObservable } from "mobx-react-lite";

import { useThrottle } from "@shared/hooks/useThrottle";
import { useToast } from "@shared/hooks/useToast";
import {
  ESPRM_PARAM_TIME_SERIES_PROPERTY,
  ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY,
  ESPRM_PARAM_WRITE_PROPERTY,
  PARAM_CONTROL_THROTTLE_MS,
} from "@shared/utils/constants";
import {
  coerceParamValueToBoolean,
  getParamControlBounds,
  isBooleanControlParam,
  PARAM_BOUNDS_CONTROL_BOARD_ACTIONS,
  PARAM_BOUNDS_VALUE_SUFFIX,
  shouldPersistWriteWithoutLocalUpdate,
} from "@shared/utils/paramUtils";
import { resolveParamDisplayLabel } from "@shared/utils/deviceParams";

import {
  ParamControlProps,
  getParamBounds,
  ParamControlChildProps,
  comparableRoundedParamNumber,
  normalizeNumericParamValue,
} from "./lib/types";

/**
 * Coerces a param value for local control state (boolean vs numeric).
 * @param param - Device parameter that defines the control type
 * @param value - Raw value from the device or UI
 * @returns Normalized value for the control
 */
function normalizeParamControlValue(
  param: ParamControlProps["param"],
  value: unknown,
): unknown {
  if (isBooleanControlParam(param)) {
    return coerceParamValueToBoolean(value);
  }
  return normalizeNumericParamValue(value);
}

/**
 * ParamControlWrap
 *
 * A wrapper component for controlling device parameter.
 *
 * Persists numeric changes via {@link useThrottle} (latest value wins, serial async drain, spacing via
 * `PARAM_CONTROL_THROTTLE_MS`).
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns Shell around a numeric param child with bounds and leading/trailing-throttled `param.setValue`; optional chart entry
 */
const ParamControlWrap = observer(
  ({
    param,
    disabled = false,
    setUpdating,
    onOpenChart,
    children,
    style,
  }: ParamControlProps) => {
    const { min, max } = getParamBounds(param);
    const paramUpdateDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasFiniteBounds =
      typeof min === "number" &&
      Number.isFinite(min) &&
      typeof max === "number" &&
      Number.isFinite(max);
    const toast = useToast();
    const paramBounds = getParamControlBounds(param);

    const state = useLocalObservable(() => ({
      value: normalizeParamControlValue(param, param.value),
      setValue: (next: unknown) => {
        state.value = next;
      },
    }));

    const isTimeSeriesParam = useMemo(
      () =>
        [
          ESPRM_PARAM_TIME_SERIES_PROPERTY,
          ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY,
        ].some((property) => param.properties?.includes(property)),
      [param.properties],
    );

    const isWritable = useMemo(
      () => param.properties?.includes(ESPRM_PARAM_WRITE_PROPERTY) ?? false,
      [param.properties],
    );

    const displayLabel = useMemo(
      () => resolveParamDisplayLabel(param),
      [param],
    );

    // Slider-style params (writable + finite numeric bounds) need a debounce
    // so an in-flight subscription frame doesn't clobber the user's drag mid
    // gesture. Action-style params (control board, dropdown chips, status
    // pills, action buttons, read-only telemetry) have no local drag to
    // protect — `shouldPersistWriteWithoutLocalUpdate` already keeps the UI
    // off the optimistic-update path for them — so deferring device-state
    // updates by 3 s only adds a perceived "tap → glyph appears" lag (e.g.
    // Start → Pause glyph on the RVC Control tile).
    const isSliderStyleParam = isWritable && hasFiniteBounds;

    useEffect(() => {
      if (!isSliderStyleParam) {
        state.value = normalizeParamControlValue(param, param.value);
        return;
      }

      const debounceUpdateDelay = 3000;

      if (paramUpdateDelayTimeoutRef.current === null) {
        state.value = normalizeParamControlValue(param, param.value);
      }

      if (paramUpdateDelayTimeoutRef.current !== null) {
        clearTimeout(paramUpdateDelayTimeoutRef.current);
      }
      paramUpdateDelayTimeoutRef.current = setTimeout(() => {
        state.value = normalizeParamControlValue(param, param.value);
        paramUpdateDelayTimeoutRef.current = null;
      }, debounceUpdateDelay);

      return () => {
        if (paramUpdateDelayTimeoutRef.current !== null) {
          clearTimeout(paramUpdateDelayTimeoutRef.current);
        }
      };
    }, [param, param.value, state, state.value, isSliderStyleParam]);

    const paramRef = useRef(param);
    paramRef.current = param;

    const enqueueUpdate = useThrottle(
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
     * Applies optional numeric rounding and bounds checks, updates local UI state,
     * and schedules throttled persistence (latest queued value wins).
     */
    const handleValueChange = async (
      _event: GestureResponderEvent | null,
      newValue: unknown,
      validate: boolean = true,
    ) => {
      if (disabled || !isWritable) return;

      if (shouldPersistWriteWithoutLocalUpdate(param, newValue)) {
        enqueueUpdate(newValue);
        return;
      }

      if (typeof newValue === "number" && validate) {
        const roundedValue = Math.round(newValue);
        const cur = comparableRoundedParamNumber(state.value);
        if (cur !== null && roundedValue === cur) return;
        if (hasFiniteBounds) {
          if (roundedValue < min!) {
            toast.showError("Value is below minimum");
            return;
          }
          if (roundedValue > max!) {
            toast.showError("Value is above maximum");
            return;
          }
        }
        newValue = roundedValue;
      }
      state.setValue(newValue);
      enqueueUpdate(newValue);
    };

    return (
      <View style={[style]}>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(
            child as ReactElement<ParamControlChildProps>,
            {
              label: displayLabel,
              value: state.value,
              onValueChange: handleValueChange,
              // time_series readouts stay pressable (even when read-only) so
              // the chart entry works. Writable params follow the passed
              // `disabled` (e.g. disconnected). Any other read-only param is a
              // pure display, so force it disabled — this hides the edit
              // affordance and guarantees a read-only param never offers a
              // write path.
              disabled: isTimeSeriesParam
                ? disabled
                : isWritable
                  ? disabled
                  : true,
              meta: {
                ...getParamBounds(param),
                dataType: param.dataType,
                labels: paramBounds.labels,
                valueSuffix: paramBounds[PARAM_BOUNDS_VALUE_SUFFIX] ?? "",
                controlBoardActions: paramBounds[PARAM_BOUNDS_CONTROL_BOARD_ACTIONS],
              },
              onOpenChart: onOpenChart ? () => onOpenChart(param) : null,
            },
          );
        })}
      </View>
    );
  },
);

export default ParamControlWrap;
