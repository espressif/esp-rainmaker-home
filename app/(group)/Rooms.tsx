/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo } from "react";
import {
  Text,
  StyleSheet,
  Pressable,
  Image,
  FlatList,
  RefreshControl,
  ListRenderItem,
  ScrollView,
  View,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import { ESPRMGroup } from "@espressif/rainmaker-base-sdk";

// Hooks
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { observer, useLocalObservable } from "mobx-react-lite";
import { useFocusEffect } from "expo-router";

// Icons
import { Plus } from "lucide-react-native";

// Components
import { Header, RoomCard } from "@/components";

// Utils
import { testProps } from "@/utils/testProps";

/**
 * Room
 *
 * A screen component that displays and manages rooms within a home.
 * Allows users to view existing rooms and add new ones.
 *
 * @returns JSX component
 */
const Rooms = observer(() => {
  // Hooks
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const {
    store: { groupStore },
    fetchAllGroups,
  } = useCDF();

  // State
  const state = useLocalObservable(() => ({
    rooms: [] as ESPRMGroup[],
    home: groupStore?._groupsByID[id as string] || null,
    refreshing: false,
  }));

  /**
   * Fetches the group and sets the state
   *
   * CDF function used:
   * - groupStore.syncGroupList
   */
  const fetchGroup = async () => {
    if (state.refreshing || !id) return;

    state.refreshing = true;
    try {
      /*
      For page on focus, we need to fetch the first page again
      */
      const shouldFetchFirstPage = true;
      await fetchAllGroups(shouldFetchFirstPage);
      const home = groupStore?._groupsByID[id as string];
      state.home = home;
      if (home) {
        const rooms = (home.subGroups as ESPRMGroup[]) || [];

        const uniqueRooms = rooms.reduce((acc, room) => {
          if (!acc.find((existingRoom) => existingRoom.id === room.id)) {
            acc.push(room);
          }
          return acc;
        }, [] as ESPRMGroup[]);

        state.rooms = uniqueRooms;
      }
    } catch (error) {
      console.error("Error fetching group:", error);
    } finally {
      state.refreshing = false;
    }
  };

  /**
   * Effect to fetch the group
   */
  useFocusEffect(
    useCallback(() => {
      fetchGroup();
    }, [])
  );

  /**
   * Memoized rooms calculation
   * Prevents unnecessary recalculations and state updates
   */
  const memoizedRooms = useMemo(() => {
    if (!state.home?.subGroups) return [];

    const rooms = state.home.subGroups as ESPRMGroup[];
    const uniqueRooms = rooms.reduce((acc, room) => {
      if (!acc.find((existingRoom) => existingRoom.id === room.id)) {
        acc.push(room);
      }
      return acc;
    }, [] as ESPRMGroup[]);

    return uniqueRooms;
  }, [state.home?.subGroups, state.home?.id]);

  /**
   * Effect to update rooms state when memoized rooms change
   */
  useEffect(() => {
    if (!state.refreshing && memoizedRooms.length !== state.rooms.length) {
      state.rooms = memoizedRooms;
    }
  }, [memoizedRooms, state.refreshing]);

  // Handlers
  /**
   * Handles the addition of a room
   */
  const handleAddRoom = () => {
    router.push({
      pathname: "/(group)/CreateRoom",
      params: {
        id: id,
      },
    } as any);
  };

  /**
   * Renders the empty room content
   * Shows a banner with a title, subtitle, and an illustration
   * Shows an add room button
   */
  const renderEmptyRoomContent = () => {
    return (
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={onRefresh}
            colors={[tokens.colors.primary]}
            tintColor={tokens.colors.primary}
            progressViewOffset={10}
          />
        }
        {...testProps("scroll_rooms")}
      >
        <Pressable {...testProps("button_rooms")} style={styles.emptyRoomContent}>
          <Text {...testProps("text_add_your_first_room_title")} style={styles.title}>{t("group.rooms.addYourFirstRoom")}</Text>
          <Text {...testProps("text_add_your_first_room_subtitle")} style={styles.subtitle}>
            {t("group.rooms.addRoomDescription")}
          </Text>
          <Image
            {...testProps("image_rooms")}
            source={require("@/assets/images/room.png")}
            style={styles.illustration}
            resizeMode="contain"
          />
          {/* Add room button */}
          <Pressable {...testProps("button_add_room")} style={styles.addButton} onPress={handleAddRoom}>
            <Plus
              {...testProps("icon_plus")}
              size={24}
              color={tokens.colors.white}
              onPress={handleAddRoom}
            />
          </Pressable>
        </Pressable>
      </ScrollView>
    );
  };

  /**
   * Handles pull-to-refresh action
   * Triggers groupStore sync to refresh the list
   *
   * CDF function used:
   * - groupStore.syncGroupList
   */
  const onRefresh = useCallback(async () => {
    if (!groupStore || state.refreshing) return;

    await fetchGroup();
  }, [groupStore]);

  /**
   * Handles the press event
   * Opens the CreateRoom screen for editing
   *
   * @param roomId - The id of the room to edit or delete
   */
  const handlePressRoom = useCallback((roomId: string) => {
    const room = memoizedRooms.find((r) => r.id === roomId);
    if (room) {
      router.push({
        pathname: "/(group)/CreateRoom",
        params: {
          roomId: room.id,
          id: state.home?.id,
        },
      } as any);
    }
  }, [memoizedRooms, state.home?.id, router]);

  /**
   * Memoized render function for room items
   * Prevents unnecessary re-renders of room cards
   */
  const renderRoomItem: ListRenderItem<ESPRMGroup> = useCallback(({ item }) => (
    <RoomCard
      room={item}
      onPressRoom={handlePressRoom}
      enableSwipeActions={false}
      qaId="card_room"
    />
  ), [handlePressRoom]);

  /**
   * Memoized keyExtractor for FlatList
   * Provides stable keys for better performance
   */
  const keyExtractor = useCallback((item: ESPRMGroup, index: number) =>
    `room-${item.id}-${index}`, []
  );



  // Render
  return (
    <>
      <Header
        label={state.home?.name || ""}
        showBack={router.canGoBack()}
        rightSlot={
          <Plus size={24} color={tokens.colors.primary} onPress={handleAddRoom} />
        } qaId="header_rooms"
      />
      <View {...testProps("view_rooms")} style={{ ...styles.container, backgroundColor: tokens.colors.bg5 }}>
        {memoizedRooms && memoizedRooms.length > 0 ? (
          <FlatList
            data={memoizedRooms}
            keyExtractor={keyExtractor}
            renderItem={renderRoomItem}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={state.refreshing}
                onRefresh={onRefresh}
                colors={[tokens.colors.primary]}
                tintColor={tokens.colors.primary}
                progressViewOffset={10}
              />
            }
            onEndReachedThreshold={0.5}
            // Performance optimizations
            removeClippedSubviews={false}
            maxToRenderPerBatch={10}
            initialNumToRender={10}
            windowSize={10}
            updateCellsBatchingPeriod={50}
            // Add padding to handle touch areas better
            contentContainerStyle={styles.flatListContent}
            style={styles.flatListContainer}
            // Ensure scroll is always enabled
            scrollEnabled={true}
            bounces={true}
          />
        ) : (
          <View {...testProps("view_rooms_empty")} style={styles.emptyRoomContainer}>
            {renderEmptyRoomContent()}
          </View>
        )}
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg1,
    paddingBottom: 88,
    paddingTop: tokens.spacing._20,
  },
  flatListContainer: {
    flex: 1,
  },
  flatListContent: {
    paddingHorizontal: tokens.spacing._15,
    paddingBottom: tokens.spacing._20,
    flexGrow: 1,
  },
  emptyRoomContainer: {
    flex: 1,
    paddingHorizontal: tokens.spacing._15,
  },
  emptyRoomContent: {
    alignItems: "center",
    padding: tokens.spacing._30,
    backgroundColor: tokens.colors.white,
    marginTop: tokens.spacing._15,
    ...globalStyles.shadowElevationForLightTheme,
  },
  title: {
    ...globalStyles.fontMedium,
    fontSize: 18,
    marginBottom: tokens.spacing._5,
  },
  subtitle: {
    ...globalStyles.fontRegular,
    color: tokens.colors.gray,
    marginBottom: tokens.spacing._30,
  },
  illustration: {
    width: "100%",
    height: 200,
    marginBottom: tokens.spacing._30,
  },
  addButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default Rooms;
