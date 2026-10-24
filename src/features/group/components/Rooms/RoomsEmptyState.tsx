/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
} from "react-native";
import { Plus } from "lucide-react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import { resolveIllustration } from "@shared/runtimeStyle/assets";

export interface RoomsEmptyStateProps {
  title: string;
  subtitle: string;
  refreshing: boolean;
  onRefresh: () => void;
  onAddRoom: () => void;
  /** Optional test id for scroll view */
  scrollTestId?: string;
}

/**
 * Empty state for Rooms screen: title, subtitle, illustration, add button.
 * Includes pull-to-refresh. UI only.
 */
export const RoomsEmptyState: React.FC<RoomsEmptyStateProps> = ({
  title,
  subtitle,
  refreshing,
  onRefresh,
  onAddRoom,
  scrollTestId = "scroll_rooms",
}) => (
  <ScrollView
    refreshControl={
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        colors={[tokens.colors.primary]}
        tintColor={tokens.colors.primary}
        progressViewOffset={10}
      />
    }
    {...testProps(scrollTestId)}
  >
    <Pressable
      {...testProps("button_rooms")}
      style={globalStyles.roomsEmptyRoomContent}
    >
      <Text
        {...testProps("text_add_your_first_room_title")}
        style={globalStyles.roomsEmptyTitle}
      >
        {title}
      </Text>
      <Text
        {...testProps("text_add_your_first_room_subtitle")}
        style={globalStyles.roomsEmptySubtitle}
      >
        {subtitle}
      </Text>
      <Image
        {...testProps("image_rooms")}
        source={resolveIllustration("room", require("@assets/images/room.png"))}
        style={globalStyles.roomsEmptyIllustration}
        resizeMode="contain"
      />
      <Pressable
        {...testProps("button_add_room")}
        style={globalStyles.roomsAddButton}
        onPress={onAddRoom}
      >
        <Plus
          {...testProps("icon_plus")}
          size={24}
          color={tokens.colors.white}
          onPress={onAddRoom}
        />
      </Pressable>
    </Pressable>
  </ScrollView>
);
