/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text, TouchableOpacity, View } from "react-native";
import { Lock, LockOpen } from "lucide-react-native";
import { observer } from "mobx-react-lite";

import { LOCK_CONTROL_UNLOCKED_STATE } from "@shared/utils/constants";
import { tokens } from "@shared/theme/tokens";
import { paramControlStyles as styles } from "./lib/styles";
import { ParamControlChildProps } from "./lib/types";
import {
  isUnknownParamValue,
  resolveControlBoard,
  type ParamControlBoardActionSpec,
} from "@shared/utils/paramUtils";

const BUTTON_SIZE = 120;
const ICON_SIZE = BUTTON_SIZE * 0.32;

/**
 * Returns whether the lock is shown in the engaged (locked) visual state.
 * @param stateValue - Current param value slug from the adaptor resolver.
 * @returns `true` when the lock should render as engaged (locked icon).
 */
function isLockEngaged(stateValue: unknown): boolean {
  if (isUnknownParamValue(stateValue)) {
    return false;
  }
  return String(stateValue ?? "") !== LOCK_CONTROL_UNLOCKED_STATE;
}

/**
 * LockControl
 *
 * Circular lock/unlock control driven by `meta.controlBoardActions` in param bounds.
 * Renders lock/unlock icons from the resolved action spec; tap invokes the
 * mapped Matter command via the adaptor write path.
 * @param value - Current lock state slug read from the param.
 * @param onValueChange - Persists the resolved action token via `setValue`.
 * @param disabled - When true, the control is inactive.
 * @param meta - Param metadata including `controlBoardActions`.
 * @returns Circular lock control with action icon and label.
 */
const LockControl = observer(
  ({ value, onValueChange, disabled, meta }: ParamControlChildProps) => {
    const controlBoardActions = meta?.controlBoardActions as
      | Record<string, ParamControlBoardActionSpec>
      | undefined;
    const control = resolveControlBoard(value, controlBoardActions);
    const engaged = isLockEngaged(value);
    const isDisabled = disabled || control == null;

    /**
     * Sends the lock/unlock action token for adaptor command encoding.
     */
    const handlePress = () => {
      if (isDisabled || !control || !onValueChange) {
        return;
      }
      onValueChange(null, control.action);
    };

    const buttonColor = engaged
      ? tokens.colors.primary
      : tokens.colors.text_secondary;
    const iconColor = tokens.colors.white;

    return (
      <View style={styles.controlBoardWrapper}>
        <TouchableOpacity
          style={[
            styles.controlBoardButton,
            {
              width: BUTTON_SIZE,
              height: BUTTON_SIZE,
              borderRadius: BUTTON_SIZE / 2,
              backgroundColor: buttonColor,
            },
            isDisabled && styles.disabled,
          ]}
          onPress={handlePress}
          activeOpacity={0.85}
          disabled={isDisabled}
        >
          <View
            style={[
              styles.controlBoardButtonInner,
              {
                width: BUTTON_SIZE - 8,
                height: BUTTON_SIZE - 8,
                borderRadius: (BUTTON_SIZE - 8) / 2,
                backgroundColor: buttonColor,
              },
            ]}
          >
            {control?.icon === "unlock" ? (
              <LockOpen
                size={ICON_SIZE}
                color={iconColor}
                strokeWidth={2.5}
              />
            ) : (
              <Lock
                size={ICON_SIZE}
                color={iconColor}
                strokeWidth={2.5}
              />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.controlBoardLabel}>{control?.label ?? "—"}</Text>
      </View>
    );
  },
);

export default LockControl;
