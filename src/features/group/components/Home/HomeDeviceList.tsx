/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, FlatList, RefreshControl } from "react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { DeviceCard } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import type { UseHomeViewModelResult } from "@features/group/hooks";

export interface HomeDeviceListProps {
  roomDevices: UseHomeViewModelResult["roomDevices"];
  refreshing: boolean;
  onRefresh: () => void;
  /** Banner, tabs, filters, group cards — scrolls with the list so pull-to-refresh works above devices. */
  listHeader?: React.ReactNode;
  /** Shown when `roomDevices` is empty (e.g. add-first-device CTA). */
  listEmpty?: React.ReactNode;
}

/**
 * Single Home scroll surface: optional header + device cards + pull-to-refresh.
 * Refresh works from header chrome as well as over device cards.
 * `bounces` / `alwaysBounceVertical` keep short content pullable on iOS.
 *
 * @param props - Devices, refresh handlers, optional header/empty slots
 * @returns FlatList filling the remaining Home screen area
 */
export const HomeDeviceList: React.FC<HomeDeviceListProps> = ({
  roomDevices,
  refreshing,
  onRefresh,
  listHeader,
  listEmpty,
}) => (
  <View {...testProps("view_devices_list_home")} style={globalStyles.flex1}>
    <FlatList
      {...testProps("list_devices_home")}
      data={roomDevices}
      keyExtractor={(_, index) => index.toString()}
      ListHeaderComponent={listHeader ? <>{listHeader}</> : null}
      ListEmptyComponent={listEmpty ? <>{listEmpty}</> : null}
      renderItem={({ item }) => {
        const nodeRef = item.node.deref();
        return nodeRef ? (
          <DeviceCard
            node={nodeRef}
            device={item}
            key={nodeRef.id + item.name}
            qaId="device_card_home"
          />
        ) : null;
      }}
      contentContainerStyle={[
        globalStyles.homeDeviceList,
        roomDevices.length === 0 ? { flexGrow: 1 } : null,
      ]}
      showsVerticalScrollIndicator={false}
      numColumns={1}
      bounces
      alwaysBounceVertical
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
);
