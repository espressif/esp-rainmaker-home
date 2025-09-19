/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";

// Icons
import { ChevronDown } from "lucide-react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Platform Setup
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Types
interface CollapsibleCardProps {
  /** Card title */
  title: string;
  /** Optional description text */
  description?: string;
  /** Child elements to show when expanded */
  children?: React.ReactNode;
  /** Whether card starts expanded */
  defaultExpanded?: boolean;
  /** Show item count badge */
  showItemCount?: boolean;
  /** Number of items to show in badge */
  itemCount?: string | number;
  /** Label for items (e.g. "item" or "device") */
  itemLabel?: string;
  /** Additional container style overrides */
  style?: any;
  /** Additional header style overrides */
  headerStyle?: any;
  /** Additional content style overrides */
  contentStyle?: any;
  /** Animation duration in ms */
  animationDuration?: number;
  /** Whether the card is expandable */
  isExpandable?: boolean;
}

/**
 * CollapsibleCard
 *
 * An expandable/collapsible card component with smooth animations.
 * Features:
 * - Animated expand/collapse
 * - Optional item count badge
 * - Customizable styles
 * - Custom animation duration
 */
const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  title,
  description,
  children,
  defaultExpanded = false,
  showItemCount = false,
  itemCount = "",
  itemLabel = "item",
  style,
  headerStyle,
  contentStyle,
  animationDuration = 300,
  isExpandable = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const animatedRotation = useRef(
    new Animated.Value(defaultExpanded ? 1 : 0)
  ).current;

  const getItemCountText = () => {
    if (!showItemCount) return null;
    const count = itemCount;
    let label = itemLabel;
    if (typeof count === "number") {
      label = count <= 1 ? itemLabel : `${itemLabel}s`;
      return `${count} ${label}`;
    }
    return label;
  };

  const toggleExpanded = () => {
    if (!isExpandable) return;
    const toValue = isExpanded ? 0 : 1;

    // Use LayoutAnimation for smooth height transition
    LayoutAnimation.configureNext({
      duration: animationDuration,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.scaleXY,
      },
    });

    setIsExpanded(!isExpanded);

    // Animate chevron rotation
    Animated.timing(animatedRotation, {
      toValue,
      duration: animationDuration,
      useNativeDriver: true,
    }).start();
  };

  const rotateInterpolate = animatedRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const animatedRotationStyle = {
    transform: [{ rotate: rotateInterpolate }],
  };

  return (
    <View style={[styles.card, style]}>
      <TouchableOpacity
        style={[styles.header, headerStyle]}
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {(description || showItemCount) && (
              <Text style={styles.subtitle}>
                {description || getItemCountText()}
              </Text>
            )}
          </View>
          {isExpandable && (
            <View style={styles.chevronContainer}>
              <Animated.View style={animatedRotationStyle}>
                <ChevronDown size={16} color={tokens.colors.black} />
              </Animated.View>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={[styles.content, contentStyle]}>{children}</View>
      )}
    </View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  card: {
    ...globalStyles.bgWhite,
    ...globalStyles.radiusSm,
    marginBottom: tokens.spacing._15,
    overflow: "hidden",
  },
  header: {
    padding: tokens.spacing._15,
    paddingBottom: tokens.spacing._10,
  },
  headerContent: {
    ...globalStyles.flex,
    ...globalStyles.justifyBetween,
    ...globalStyles.alignCenter,
    width: "100%",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontWeight: 500,
    fontFamily: tokens.fonts.medium,
    marginBottom: 0,
  },
  subtitle: {
    ...globalStyles.fontXs,
    ...globalStyles.textGray,
    marginTop: 2,
  },
  chevronContainer: {
    width: 28,
    height: 28,
    ...globalStyles.radiusSm,
    ...globalStyles.itemCenter,
    backgroundColor: tokens.colors.gray + "15",
  },
  content: {
    padding: tokens.spacing._15,
    paddingTop: tokens.spacing._10,
  },
});

export default CollapsibleCard;
