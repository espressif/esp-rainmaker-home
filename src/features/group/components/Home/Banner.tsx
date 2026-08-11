/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Icons
import { ChevronRight } from "lucide-react-native";
import Skeleton from "react-native-reanimated-skeleton";

// SDK
import { ESPCDFGroup } from "@store";

// Hooks
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { testProps } from "@shared/utils/testProps";
import { SKELETON_ANIMATION_PULSE } from "@shared/utils/constants";

// Types
interface BannerProps {
  /** Image source for the banner */
  image: any;
  /** Currently active group */
  activeGroup: ESPCDFGroup | null;
  /** Callback when the dropdown button is pressed */
  onDropdownPress: (position: { x: number; y: number }) => void;
  /**
   * When true (or when the home name is not yet available), the dropdown
   * row shows a compact skeleton instead of the home name.
   */
  isHomeNameLoading?: boolean;
}

/**
 * Banner
 *
 * A banner component that displays the current home/group selection
 * with a dropdown to switch between available groups.
 * Features:
 * - Group selection dropdown
 * - Welcome message
 * - Decorative image
 */
const Banner: React.FC<BannerProps> = ({
  image,
  activeGroup,
  onDropdownPress,
  isHomeNameLoading = false,
}) => {
  const { t } = useTranslation();
  const buttonRef = React.useRef<View>(null);
  const showHomeNameSkeleton =
    isHomeNameLoading || !(activeGroup?.name && activeGroup.name.length > 0);

  const handlePress = () => {
    if (showHomeNameSkeleton) {
      return;
    }
    if (buttonRef.current) {
      buttonRef.current.measure(
        (
          _x: number,
          _y: number,
          _width: number,
          height: number,
          pageX: number,
          pageY: number
        ) => {
          // Use pageX and pageY for true screen coordinates
          onDropdownPress({ x: pageX, y: pageY + height + 5 });
        }
      );
    }
  };

  return (
    <View style={styles.banner} {...testProps("view_home_banner")}>
      <View style={styles.messageContainer}>
        <Text {...testProps("text_title_home_banner")}>
          {t("group.home.homeBannerTitle")}
        </Text>
        <TouchableOpacity
          ref={buttonRef}
          {...testProps("button_dropdown_home_banner")}
          style={styles.smartHomeButton}
          onPress={handlePress}
          disabled={showHomeNameSkeleton}
        >
          {showHomeNameSkeleton ? (
            <Skeleton
              isLoading
              animationType={SKELETON_ANIMATION_PULSE}
              boneColor={tokens.colors.bg1}
              highlightColor={tokens.colors.bg}
              containerStyle={styles.homeNameSkeleton}
              layout={[
                {
                  key: "home_dropdown_name",
                  width: 96,
                  height: 16,
                  borderRadius: tokens.radius.sm,
                },
              ]}
            />
          ) : (
            <>
              <Text style={styles.smartHomeText}>{activeGroup?.name}</Text>
              <ChevronRight color={tokens.colors.gray} size={15} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <Image
        {...testProps("image_home_banner")}
        source={image}
        style={styles.image}
      />
    </View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  banner: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: tokens.colors.white,
    flexDirection: "row",
    alignItems: "center",
    ...globalStyles.shadowElevationForLightTheme,
    borderRadius: tokens.radius.md,
  },
  messageContainer: {
    flex: 1,
  },
  smartHomeButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    minHeight: 20,
  },
  homeNameSkeleton: {
    width: 96,
    height: 16,
  },
  smartHomeText: {
    fontWeight: "bold",
    fontSize: tokens.fontSize.md,
    marginRight: 4,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
  },
  image: {
    width: "100%",
    objectFit: "contain",
    maxWidth: 165,
    height: 80,
  },
});

export default observer(Banner);
