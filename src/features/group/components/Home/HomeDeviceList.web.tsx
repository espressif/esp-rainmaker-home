/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, FlatList, RefreshControl, StyleSheet } from "react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { DeviceCard } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import type { UseHomeViewModelResult } from "@features/group/hooks";

export interface HomeDeviceListProps {
  roomDevices: UseHomeViewModelResult["roomDevices"];
  refreshing: boolean;
  onRefresh: () => void;
  /**
   * Banner, tabs, filters, group cards — pinned above the list on web
   * (phone embed / mobile browser) so only device cards scroll.
   */
  listHeader?: React.ReactNode;
  /** Shown when `roomDevices` is empty (e.g. add-first-device CTA). */
  listEmpty?: React.ReactElement | null;
}

/**
 * Web Home layout: chrome stays fixed; only the device FlatList scrolls.
 * Keeps the phone-frame viewport usable when Banner + tabs + filters + All On
 * would otherwise push devices below the fold.
 * @param props - Devices, refresh handlers, optional header/empty slots
 * @returns Sticky header + scrollable device list
 */
export const HomeDeviceList: React.FC<HomeDeviceListProps> = ({
  roomDevices,
  refreshing,
  onRefresh,
  listHeader,
  listEmpty,
}) => (
  <View {...testProps("view_devices_list_home")} style={styles.root}>
    {listHeader ? (
      <View {...testProps("view_home_list_header_pinned")} style={styles.header}>
        {listHeader}
      </View>
    ) : null}
    <View style={styles.listPane}>
      <FlatList
        {...testProps("list_devices_home")}
        data={roomDevices}
        keyExtractor={(item) => {
          const nodeRef = item.node.deref();
          return nodeRef ? nodeRef.id + item.name : item.name;
        }}
        ListEmptyComponent={listEmpty ?? null}
        renderItem={({ item }) => {
          const nodeRef = item.node.deref();
          return nodeRef ? (
            <DeviceCard
              node={nodeRef}
              device={item}
              qaId="device_card_home"
            />
          ) : null;
        }}
        contentContainerStyle={[
          globalStyles.homeDeviceList,
          roomDevices.length === 0 ? styles.emptyGrow : null,
        ]}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        numColumns={1}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[tokens.colors.primary]}
            tintColor={tokens.colors.primary}
            progressViewOffset={10}
          />
        }
      />
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    width: "100%",
    flexShrink: 0,
  },
  listPane: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  emptyGrow: {
    flexGrow: 1,
  },
});
