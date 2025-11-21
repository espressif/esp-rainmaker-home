/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ActivityIndicator, FlatList, StyleSheet } from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Hooks
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useTranslation } from "react-i18next";

// Components
import {
  Header,
  ScreenWrapper,
  NotificationItem,
  EmptyState,
} from "@/components";

// Types
import { SharingItem } from "@/types/global";

/**
 * NotificationCenter
 *
 * Displays a list of device and group sharing invitations
 * Handles accepting/declining invitations
 * Shows loading states and empty state
 */
const NotificationCenter: React.FC = () => {
  // Hooks
  const { t } = useTranslation();
  const { sharingList, isLoading, formatTimestamp, handleAccept } =
    useNotificationCenter();

  // Handlers
  const renderNotificationItem = ({ item }: { item: SharingItem }) => (
    <NotificationItem
      key={item.id}
      title={
        item.type === "node"
          ? t("user.notifications.deviceSharingInvitation")
          : t("user.notifications.groupSharingInvitation")
      }
      description={t("user.notifications.invitationFrom", {
        userName: item.primaryUsername,
      })}
      timestamp={formatTimestamp(item.timestamp)}
      status={item.status}
      onAccept={() => handleAccept(item, true)}
      onDecline={() => handleAccept(item, false)}
      loading={item.loading}
      acceptLoading={item.acceptLoading}
      declineLoading={item.declineLoading}
      qaId="notification_item_notification_center"
    />
  );

  // Render helpers
  const renderContent = () => {
    if (isLoading) {
      return <ActivityIndicator size="small" color={tokens.colors.primary} />;
    }

    if (!sharingList?.length) {
      return <EmptyState message={t("user.notifications.noNotification")} qaId="empty_state_notification_center" />;
    }

    return (
      <FlatList
        data={sharingList}
        renderItem={renderNotificationItem}
        keyExtractor={(item) => item.request_id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    );
  };

  // Render
  return (
    <>
      <Header label={t("user.notifications.title")} showBack={true} qaId="header_notification_center" />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }} qaId="screen_wrapper_notification_center"
      >
        {renderContent()}
      </ScreenWrapper>
    </>
  );
};

// Styles
const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
  },
});

export default NotificationCenter;
