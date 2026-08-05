/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import type { ESPCDFGroup } from "@store";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import ControlGroupCard from "../Rooms/ControlGroupCard";

export interface HomeGroupControlListProps {
  groups: ESPCDFGroup[];
  homeId: string;
}

/**
 * Non-scrolling grid of group-control cards on Home, plus divider before devices.
 * Uses a plain View (not a nested FlatList) so the parent Home list owns
 * vertical pull-to-refresh gestures over this region.
 *
 * @param props - Control groups and parent home id for navigation
 * @returns Group cards grid + divider, or null when empty
 */
export const HomeGroupControlList: React.FC<HomeGroupControlListProps> = ({
  groups,
  homeId,
}) => {
  if (groups.length === 0 || !homeId) {
    return null;
  }

  return (
    <>
      <View
        {...testProps("list_home_group_control")}
        style={styles.listContent}
      >
        {groups.map((group) => (
          <ControlGroupCard
            key={group.id}
            group={group}
            homeId={homeId}
            qaId="card_group_control_home"
          />
        ))}
      </View>
      <View
        {...testProps("view_home_group_control_divider")}
        style={styles.divider}
      />
    </>
  );
};

const styles = StyleSheet.create({
  /** Non-scrolling grid: wraps cards like `homeDeviceList` (row + wrap). */
  listContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.borderColor,
    marginHorizontal: tokens.spacing._15,
    marginTop: tokens.spacing._20,
    marginBottom: tokens.spacing._5,
  },
});
