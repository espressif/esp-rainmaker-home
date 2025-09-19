/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";

// Navigation
import { useRouter } from "expo-router";

// Icons
import { CheckCircle2 } from "lucide-react-native";

// Styles
import { tokens } from "@/theme/tokens";

// Types
import { ESPRMGroup } from "@espressif/rainmaker-base-sdk";

interface HomeTooltipProps {
  /** Whether the tooltip is visible */
  visible: boolean;
  /** Callback when tooltip is closed */
  onClose: () => void;
  /** Position to anchor the tooltip */
  anchorPosition?: { x: number; y: number };
  /** List of available groups */
  homeList: ESPRMGroup[];
  /** Callback when a group is selected */
  onSelectHome: (group: ESPRMGroup) => void;
  /** Currently selected group */
  selectedHome: ESPRMGroup | null;
}

/**
 * HomeTooltip
 *
 * A tooltip component for home/group selection and management.
 * Features:
 * - Group selection list
 * - Selected group indication
 * - Home management link
 * - Positioned tooltip with arrow
 * - Scrollable content
 */
const HomeTooltip: React.FC<HomeTooltipProps> = ({
  visible,
  onClose,
  anchorPosition,
  homeList,
  onSelectHome,
  selectedHome,
}) => {
  const router = useRouter();

  if (!visible) return null;

  // Handlers
  const handleHomeManagement = () => {
    router.push("/HomeManagement");
    onClose();
  };

  // Render helpers
  const renderHomeOption = (home: ESPRMGroup, index: number) => {
    const isSelected = selectedHome?.id === home.id;

    const handleSelectGroup = () => {
      onSelectHome(home);
      onClose();
    };

    return (
      <TouchableOpacity
        onPress={handleSelectGroup}
        style={[styles.menuItem, isSelected && styles.selectedMenuItem]}
        key={`group-${home.id}-${index}`}
      >
        <Text
          style={[styles.menuText, isSelected && styles.selectedMenuItemText]}
        >
          {home.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <TouchableOpacity style={styles.overlay} onPress={onClose}>
      <View
        style={[
          styles.container,
          anchorPosition && {
            position: "absolute",
            top: anchorPosition.y || 0,
            left: anchorPosition.x || 0,
          },
        ]}
      >
        <View style={styles.arrow} />
        <ScrollView
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {homeList.map((group, index) => renderHomeOption(group, index))}

          <TouchableOpacity
            onPress={handleHomeManagement}
            style={[styles.menuItem, styles.lastMenuItem]}
          >
            <Text style={styles.menuText}>Home Management</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </TouchableOpacity>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    zIndex: 9999,
    elevation: 9999,
  },
  container: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
    width: 200,
    maxHeight: 250,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    zIndex: 10000,
    position: "absolute",
  },
  scrollContainer: {
    flexGrow: 0,
  },
  arrow: {
    position: "absolute",
    top: -6,
    left: "10%",
    marginLeft: -6,
    width: 12,
    height: 12,
    backgroundColor: tokens.colors.white,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: tokens.colors.borderColor,
    transform: [{ rotate: "45deg" }],
    zIndex: 10001,
    elevation: 10000,
  },
  menuItem: {
    padding: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._5,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  selectedMenuItem: {
    backgroundColor: tokens.colors.bg1,
    borderWidth: 1,
    borderColor: tokens.colors.lightBlue,
    borderRadius: tokens.radius.sm,
  },
  selectedMenuItemText: {
    color: tokens.colors.primary,
    fontWeight: "bold",
  },
  checkIcon: {
    marginRight: tokens.spacing._10,
  },
  menuText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_primary,
    fontFamily: tokens.fonts.regular,
  },
});

export default HomeTooltip;
