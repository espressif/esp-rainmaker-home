/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text, TouchableOpacity, View } from "react-native";
import { Pause, Play } from "lucide-react-native";
import { observer } from "mobx-react-lite";

import { tokens } from "@shared/theme/tokens";
import { paramControlStyles as styles } from "./lib/styles";
import { ParamControlChildProps } from "./lib/types";
import {
  resolveControlBoard,
  type ParamControlBoardActionSpec,
} from "@shared/utils/paramUtils";

const BUTTON_SIZE = 120;

/**
 * ControlBoard
 *
 * Generic circular control-board driven by `meta.controlBoardActions` in param bounds.
 * SDK adaptors compile state → action mappings; the UI stays protocol-agnostic.
 * @param value - Current state slug read from the param.
 * @param onValueChange - Persists the resolved action token via `setValue`.
 * @param disabled - When true, the control is inactive.
 * @param meta - Param metadata including `controlBoardActions`.
 * @returns Circular control-board button with action label.
 */
const ControlBoard = observer(
  ({ value, onValueChange, disabled, meta }: ParamControlChildProps) => {
    const controlBoardActions = meta?.controlBoardActions as
      | Record<string, ParamControlBoardActionSpec>
      | undefined;
    const control = resolveControlBoard(value, controlBoardActions);
    const isDisabled = disabled || control == null;

    /**
     * Sends the transport action token for adaptor command encoding.
     */
    const handlePress = () => {
      if (isDisabled || !control || !onValueChange) {
        return;
      }
      onValueChange(null, control.action);
    };

    return (
      <View style={styles.controlBoardWrapper}>
        <TouchableOpacity
          style={[
            styles.controlBoardButton,
            {
              width: BUTTON_SIZE,
              height: BUTTON_SIZE,
              borderRadius: BUTTON_SIZE / 2,
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
              },
            ]}
          >
            {control?.icon === "pause" ? (
              <Pause
                size={BUTTON_SIZE * 0.28}
                color={tokens.colors.white}
                fill={tokens.colors.white}
                strokeWidth={0}
              />
            ) : (
              <Play
                size={BUTTON_SIZE * 0.32}
                color={tokens.colors.white}
                fill={tokens.colors.white}
                strokeWidth={0}
              />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.controlBoardLabel}>{control?.label ?? "—"}</Text>
      </View>
    );
  },
);

export default ControlBoard;
