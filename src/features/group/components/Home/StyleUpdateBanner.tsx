/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Pressable, Text, View } from "react-native";
import { Info } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

export interface StyleUpdateBannerProps {
  /** Called when the user taps Update. */
  onUpdate: () => void;
}

/**
 * Info row saying a new style is available, with an Update button.
 */
export function StyleUpdateBanner({ onUpdate }: StyleUpdateBannerProps) {
  const { t } = useTranslation();

  return (
    <View
      {...testProps("banner_style_update")}
      style={[
        globalStyles.infoBannerContainer,
        {
          marginHorizontal: tokens.spacing._15,
          marginTop: tokens.spacing._10,
          marginBottom: tokens.spacing._5,
        },
      ]}
    >
      <Info size={tokens.iconSize._15} color={tokens.colors.primary} />
      <Text
        {...testProps("text_style_update_banner")}
        style={globalStyles.infoBannerText}
      >
        {t("group.home.styleUpdateBanner")}
      </Text>
      <Pressable
        {...testProps("button_style_update_banner")}
        onPress={onUpdate}
        hitSlop={8}
        style={{
          paddingHorizontal: tokens.spacing._10,
          paddingVertical: tokens.spacing._5,
        }}
      >
        <Text
          style={{
            fontSize: tokens.fontSize.xs,
            fontFamily: tokens.fonts.medium,
            color: tokens.colors.primary,
          }}
        >
          {t("group.home.styleUpdateAction")}
        </Text>
      </Pressable>
    </View>
  );
}
