/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ReactElement, useEffect, useMemo, useRef } from "react";
import { View, GestureResponderEvent } from "react-native";

import { observer, useLocalObservable } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import { useThrottle } from "@shared/hooks/useThrottle";
import { useToast } from "@shared/hooks/useToast";
import { useOnOffToggle } from "@shared/hooks/useOnOffToggle";
import {
  DEVICE_WRITE_TIMEOUT_MS,
  ESPRM_PARAM_READ_PROPERTY,
  ESPRM_PARAM_TIME_SERIES_PROPERTY,
  ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY,
  ESPRM_PARAM_WRITE_PROPERTY,
  PARAM_CONTROL_THROTTLE_MS,
  POWER_TOGGLE_INCOMING_HOLD_MS,
  POWER_TOGGLE_LATE_ECHO_MS,
} from "@shared/utils/constants";
import { failIfNoAnswer } from "@shared/utils/deviceWriteTimeout";
import { messageKeyForFailedWrite } from "@shared/utils/deviceWriteErrorMessage";
import {
  buildParamControlMeta,
  coerceParamValueToBoolean,
  isBooleanControlParam,
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
 * `PARAM_CONTROL_THROTTLE_MS`). On/off params go through {@link useOnOffToggle} instead, so
 * every tap shows at once and the device ends on the last tap. Other non-slider params
 * (dropdowns, text) keep showing the picked value until its write settles.
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns Shell around a numeric param child with bounds and leading/trailing-throttled `param.setValue`; optional chart entry
 */
const ParamControlWrap = observer(
  ({
    param,
    disabled = false,
    setUpdating,
    onUserEdit,
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
    const { t } = useTranslation();
    const isOnOffParam = isBooleanControlParam(param);
    const mountedRef = useRef(true);
    /** The latest pick whose write has not settled, and the store value before it. */
    const pendingPickRef = useRef<{ id: number; storeBefore: unknown } | null>(
      null,
    );
    const pickCountRef = useRef(0);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    }, []);

    const state = useLocalObservable(() => ({
      value: normalizeParamControlValue(param, param.value),
      setValue: (next: unknown) => {
        state.value = next;
      },
    }));

    const isWritable = useMemo(
      () => param.properties?.includes(ESPRM_PARAM_WRITE_PROPERTY) ?? false,
      [param.properties],
    );

    /**
     * Chart entry is for telemetry with `read` plus `time_series` / `simple_ts`
     * (e.g. Neo `esp.ui.text` Wattage/Energy). Edit stays off unless `write`
     * is present — `onOpenChart` is the only press path for those rows.
     */
    const canOpenChart = useMemo(() => {
      const properties = param.properties;
      if (!properties?.includes(ESPRM_PARAM_READ_PROPERTY)) {
        return false;
      }
      return (
        properties.includes(ESPRM_PARAM_TIME_SERIES_PROPERTY) ||
        properties.includes(ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY)
      );
    }, [param.properties]);

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
      if (isOnOffParam) return;
      if (!isSliderStyleParam) {
        // Keep showing the user's pick until its write settles.
        if (pendingPickRef.current) return;
        state.setValue(normalizeParamControlValue(param, param.value));
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
    }, [param, param.value, state, state.value, isSliderStyleParam, isOnOffParam]);

    const paramRef = useRef(param);
    paramRef.current = param;

    /** Toast for a failed write, unless the user has left the screen. */
    const showWriteError = (error: unknown) => {
      if (!mountedRef.current) return;
      toast.showError(t(messageKeyForFailedWrite(error)));
    };

    const onOff = useOnOffToggle({
      storeValue: coerceParamValueToBoolean(param.value),
      readStoreValue: () => coerceParamValueToBoolean(paramRef.current.value),
      write: (next) => paramRef.current.setValue(next),
      onWriteFailed: showWriteError,
      holdMs: POWER_TOGGLE_INCOMING_HOLD_MS,
      lateEchoMs: POWER_TOGGLE_LATE_ECHO_MS,
      writeTimeoutMs: DEVICE_WRITE_TIMEOUT_MS,
    });

    /** Ends a pick: keep it, take a newer store value, or go back on failure. */
    const settlePick = (pickId: number, failed: boolean, error?: unknown) => {
      const pick = pendingPickRef.current;
      if (!pick || pick.id !== pickId) return; // a newer pick is still on its way
      pendingPickRef.current = null;
      const current = paramRef.current;
      const store = normalizeParamControlValue(current, current.value);
      if (failed) {
        state.setValue(store);
        showWriteError(error);
        return;
      }
      if (store !== pick.storeBefore) state.setValue(store);
    };

    const enqueueUpdate = useThrottle(
      async (value: unknown, pickId?: number) => {
        if (pickId === undefined) {
          // Slider and action writes: a lost reply must not block the ones queued after it.
          await failIfNoAnswer(
            Promise.resolve(paramRef.current.setValue(value)),
            DEVICE_WRITE_TIMEOUT_MS,
          );
          return;
        }
        try {
          await failIfNoAnswer(
            Promise.resolve(paramRef.current.setValue(value)),
            DEVICE_WRITE_TIMEOUT_MS,
          );
        } catch (error) {
          settlePick(pickId, true, error);
          throw error;
        }
        settlePick(pickId, false);
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
        onUserEdit?.();
        enqueueUpdate(newValue);
        return;
      }

      if (isOnOffParam) {
        onUserEdit?.();
        onOff.setOn(coerceParamValueToBoolean(newValue));
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
      onUserEdit?.();
      if (isSliderStyleParam) {
        enqueueUpdate(newValue);
        return;
      }
      const storeBefore = pendingPickRef.current
        ? pendingPickRef.current.storeBefore
        : normalizeParamControlValue(param, param.value);
      pickCountRef.current += 1;
      pendingPickRef.current = { id: pickCountRef.current, storeBefore };
      enqueueUpdate(newValue, pickCountRef.current);
    };

    return (
      <View style={[style]}>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(
            child as ReactElement<ParamControlChildProps>,
            {
              label: displayLabel,
              value: isOnOffParam ? onOff.isOn : state.value,
              onValueChange: handleValueChange,
              // No `write` → force disabled so text editors hide Edit.
              // Time-series + read still receive `onOpenChart`; the child
              // (TextInput, Temperature) opens the chart without a write path.
              disabled: isWritable ? disabled : true,
              meta: buildParamControlMeta(param),
              onOpenChart:
                onOpenChart && canOpenChart
                  ? () => onOpenChart(param)
                  : null,
            },
          );
        })}
      </View>
    );
  },
);

export default ParamControlWrap;
