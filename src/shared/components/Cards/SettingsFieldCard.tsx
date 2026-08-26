/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react-native";

import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

/** Trailing arrow points right (navigation / drawer). */
export const SETTINGS_FIELD_CARD_ARROW_RIGHT = "right";
/** Trailing arrow points down (collapsible-style affordance). */
export const SETTINGS_FIELD_CARD_ARROW_DOWN = "down";

/** Trailing arrow orientation for {@link SettingsFieldCard}. */
export type SettingsFieldCardArrowDirection =
  | typeof SETTINGS_FIELD_CARD_ARROW_RIGHT
  | typeof SETTINGS_FIELD_CARD_ARROW_DOWN;

/** Label typography variant for {@link SettingsFieldCard}. */
export type SettingsFieldCardLabelVariant = "title" | "muted";

export interface SettingsFieldCardProps {
  /** Primary label on the left (e.g. "Room" or "Node Information"). */
  label: string;
  /** Optional value shown on the right (e.g. current room name). */
  value?: string;
  /** Optional secondary line under the label. */
  description?: string;
  /** Label style: card title or muted field label. */
  labelVariant?: SettingsFieldCardLabelVariant;
  /** Called when the row is pressed. Omit for read-only display. */
  onPress?: () => void;
  /** When true, the row is not interactive. */
  disabled?: boolean;
  /** When true, shows a trailing arrow icon on the right. */
  showArrow?: boolean;
  /** Arrow direction when {@link showArrow} is true. */
  arrowDirection?: SettingsFieldCardArrowDirection;
  /** Custom trailing icon; overrides the default chevron when set. */
  TrailingIcon?: LucideIcon;
  /** Fully custom right-side content; overrides value and arrow. */
  rightSlot?: React.ReactNode;
  /** Applies the standard settings card elevation shadow. */
  showShadow?: boolean;
  /** Container style overrides. */
  style?: StyleProp<ViewStyle>;
  /** Header row style overrides. */
  headerStyle?: StyleProp<ViewStyle>;
  /** QA automation identifier. */
  qaId?: string;
}

/**
 * Non-collapsible settings card row using the same header layout as
 * {@link CollapsibleCard}: label on the left, optional value and arrow on the
 * right. Suitable for opening drawers or navigating to detail screens.
 * @param props - Label, value, arrow, and press handlers
 */
export const SettingsFieldCard: React.FC<SettingsFieldCardProps> = ({
  label,
  value,
  description,
  labelVariant = "title",
  onPress,
  disabled = false,
  showArrow = false,
  arrowDirection = SETTINGS_FIELD_CARD_ARROW_RIGHT,
  TrailingIcon,
  rightSlot,
  showShadow = true,
  style,
  headerStyle,
  qaId,
}) => {
  const isInteractive = Boolean(onPress) && !disabled;
  const labelStyle =
    labelVariant === "title"
      ? globalStyles.settingsFieldCardTitle
      : globalStyles.settingsFieldCardLabel;

  /**
   * Renders the default trailing chevron when {@link showArrow} is enabled.
   */
  const renderTrailingArrow = () => {
    if (!showArrow) {
      return null;
    }

    const IconComponent =
      TrailingIcon ??
      (arrowDirection === SETTINGS_FIELD_CARD_ARROW_DOWN
        ? ChevronDown
        : ChevronRight);

    return (
      <View style={globalStyles.settingsFieldCardIconButton}>
        <IconComponent size={16} color={tokens.colors.black} />
      </View>
    );
  };

  /**
   * Renders the right-side value, arrow, or custom slot.
   */
  const renderRightContent = () => {
    if (rightSlot) {
      return rightSlot;
    }

    return (
      <View style={globalStyles.settingsFieldCardRight}>
        {value ? (
          <Text
            style={globalStyles.settingsFieldCardValue}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {renderTrailingArrow()}
      </View>
    );
  };

  const headerContent = (
    <View style={globalStyles.settingsFieldCardHeaderContent}>
      <View style={globalStyles.settingsFieldCardHeaderText}>
        <Text style={labelStyle} {...(qaId ? testProps(`text_label_${qaId}`) : {})}>
          {label}
        </Text>
        {description ? (
          <Text style={globalStyles.settingsFieldCardDescription}>{description}</Text>
        ) : null}
      </View>
      {renderRightContent()}
    </View>
  );

  return (
    <View
      {...(qaId ? testProps(qaId) : {})}
      style={[
        globalStyles.settingsFieldCard,
        showShadow && globalStyles.shadowElevationForLightTheme,
        disabled && globalStyles.settingsFieldCardDisabled,
        style,
      ]}
    >
      {isInteractive ? (
        <Pressable
          {...(qaId ? testProps(`button_${qaId}`) : {})}
          style={[globalStyles.settingsFieldCardHeader, headerStyle]}
          onPress={onPress}
          disabled={disabled}
        >
          {headerContent}
        </Pressable>
      ) : (
        <View style={[globalStyles.settingsFieldCardHeader, headerStyle]}>
          {headerContent}
        </View>
      )}
    </View>
  );
};

export default SettingsFieldCard;
