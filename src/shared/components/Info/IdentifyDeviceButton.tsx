/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo } from "react";
import { Pressable } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";

// Components
import IdentifyGlyph from "@shared/components/Info/IdentifyGlyph";

// Styles
import { tokens } from "@shared/theme/tokens";

import { testProps } from "@shared/utils/testProps";
import {
  DEVICE_IDENTIFY_SECONDS,
  canIdentifyDevice,
  identifyDevice,
} from "@shared/utils/deviceIdentify";
import { useIdentifyAction } from "@shared/hooks/useIdentifyAction";
import type { ESPCDFDevice } from "@store";

/** Matches the sibling pencil so the two icons sit as a pair. */
const GLYPH_SIZE = 20;

export interface IdentifyDeviceButtonProps {
  /** Device to identify — each button addresses its own device, never the node. */
  device: ESPCDFDevice;
  /** Whether the device can be reached at all */
  disabled?: boolean;
  /** QA automation identifier for the trigger */
  qaId?: string;
  /** Extra styling, for callers that need their own spacing */
  style?: StyleProp<ViewStyle>;
}

/**
 * Asks one device to show itself; each instance owns its own busy window so a
 * multi-device node animates only the row that was tapped.
 * @param props - Target device, reachability and QA id
 * @returns Icon trigger, or null when this device cannot identify
 */
const IdentifyDeviceButton: React.FC<IdentifyDeviceButtonProps> = ({
  device,
  disabled = false,
  qaId = "button_identify_device",
  style,
}) => {
  const { t } = useTranslation();
  const canIdentify = useMemo(() => canIdentifyDevice(device), [device]);
  const performIdentify = useCallback(() => identifyDevice(device), [device]);
  const { isIdentifying, identify } = useIdentifyAction(performIdentify);

  if (!canIdentify) {
    return null;
  }

  const actionDisabled = disabled || isIdentifying;

  return (
    <Pressable
      {...testProps(qaId)}
      onPress={identify}
      disabled={actionDisabled}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={
        isIdentifying
          ? t("device.identify.running")
          : t("device.identify.action")
      }
      accessibilityHint={t("device.identify.hint", {
        count: DEVICE_IDENTIFY_SECONDS,
      })}
      accessibilityState={{ busy: isIdentifying, disabled: actionDisabled }}
      style={({ pressed }) => [
        style,
        disabled && { opacity: 0.5 },
        pressed && !actionDisabled && { opacity: 0.6 },
      ]}
    >
      <IdentifyGlyph
        isIdentifying={isIdentifying}
        size={GLYPH_SIZE}
        color={
          isIdentifying ? tokens.colors.primary : tokens.colors.text_secondary
        }
      />
    </Pressable>
  );
};

export default IdentifyDeviceButton;
