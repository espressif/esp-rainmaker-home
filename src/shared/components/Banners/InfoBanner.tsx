/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { Info } from "lucide-react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

export interface InfoBannerProps {
  message: string;
  /** Applied after `globalStyles.infoBannerContainer` (e.g. horizontal margins). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Explicit test id for the message `Text` (preferred for stable E2E). */
  textTestId?: string;
  /** When `textTestId` is omitted, text uses `{qaId}_text` if `qaId` is set. */
  qaId?: string;
}

/**
 * Inline informational banner: info icon + text in a rounded tinted container.
 * Info counterpart of `WarningBanner`.
 */
export default function InfoBanner({
  message,
  containerStyle,
  textTestId,
  qaId,
}: InfoBannerProps) {
  const textProps = textTestId
    ? testProps(textTestId)
    : qaId
      ? testProps(`${qaId}_text`)
      : {};

  return (
    <View style={[globalStyles.infoBannerContainer, containerStyle]}>
      <Info size={tokens.iconSize._15} color={tokens.colors.primary} />
      <Text {...textProps} style={globalStyles.infoBannerText}>
        {message}
      </Text>
    </View>
  );
}
