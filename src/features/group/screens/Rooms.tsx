/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import type { ESPCDFGroup } from "@store";
import { Header } from "@shared/components";
import {
  RoomCard,
  RoomsEmptyState,
  RoomsList,
} from "@features/group/components";
import { testProps } from "@shared/utils/testProps";
import { useRooms, type UseRoomsOptions } from "@features/group/hooks";

/**
 * Rooms screen – UI / presentation layer.
 * Composes Group components; business logic in useRooms and utils/group.
 */
const Rooms = observer(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const {
    home,
    rooms,
    canAddRoom,
    refreshing,
    handleRefresh,
    handleAddRoom,
    handlePressRoom,
  } = useRooms({
    homeId: id,
    router: router as UseRoomsOptions["router"],
  });

  const renderRoomItem = useCallback(
    ({ item }: { item: ESPCDFGroup }) => (
      <RoomCard
        room={item as any}
        onPressRoom={handlePressRoom}
        enableSwipeActions={false}
        qaId="card_room"
      />
    ),
    [handlePressRoom],
  );

  const keyExtractor = useCallback(
    (item: ESPCDFGroup, index: number) => `room-${item.id}-${index}`,
    [],
  );

  const hasRooms = rooms.length > 0;

  return (
    <>
      <Header
        label={home?.name ?? ""}
        showBack={router.canGoBack()}
        rightSlot={
          canAddRoom ? (
            <Plus
              size={24}
              color={tokens.colors.primary}
              onPress={handleAddRoom}
            />
          ) : undefined
        }
        qaId="header_rooms"
      />
      <View
        {...testProps("view_rooms")}
        style={globalStyles.roomsScreenContainer}
      >
        {hasRooms ? (
          <RoomsList<ESPCDFGroup>
            data={rooms}
            renderItem={renderRoomItem}
            keyExtractor={keyExtractor}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        ) : (
          <View
            {...testProps("view_rooms_empty")}
            style={globalStyles.roomsEmptyRoomContainer}
          >
            <RoomsEmptyState
              title={t("group.rooms.addYourFirstRoom")}
              subtitle={t("group.rooms.addRoomDescription")}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onAddRoom={handleAddRoom}
            />
          </View>
        )}
      </View>
    </>
  );
});

export default Rooms;
