/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ActivityIndicator, FlatList, StyleSheet } from "react-native";

import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { useNotificationCenter } from "@features/user/hooks";
import { useTranslation } from "react-i18next";
import { Header, ScreenWrapper, EmptyState } from "@shared/components";
import { NotificationItem } from "@features/user/components";
import { testProps } from "@shared/utils/testProps";
import { SharingItem } from "@src/types/global";

/**
 * Renders the notification center UI section.
 */
const NotificationCenter: React.FC = () => {
  const { t } = useTranslation();
  const {
    sharingList,
    isLoading,
    formatTimestamp,
    handleAccept,
    getActionLoadingForRequest,
  } = useNotificationCenter();

  const renderNotificationItem = ({ item }: { item: SharingItem }) => {
    const actionLoading = getActionLoadingForRequest(item);
    return (
      <NotificationItem
        key={item.id}
        title={t("user.notifications.groupSharingInvitation")}
        description={
          item.primaryUsername
            ? t("user.notifications.invitationFrom", {
                userName: item.primaryUsername,
              })
            : t("user.notifications.invitationFromUnknown")
        }
        timestamp={formatTimestamp(item.timestamp)}
        status={item.status}
        onAccept={() => handleAccept(item, true)}
        onDecline={() => handleAccept(item, false)}
        loading={actionLoading.loading}
        acceptLoading={actionLoading.acceptLoading}
        declineLoading={actionLoading.declineLoading}
        qaId="notification_item_notification_center"
      />
    );
  };

  return (
    <>
      <Header
        label={t("user.notifications.title")}
        showBack={true}
        qaId="header_notification_center"
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_notification_center"
      >
        {isLoading && (
          <ActivityIndicator size="small" color={tokens.colors.primary} />
        )}

        {!isLoading &&
          (sharingList?.length ? (
            <FlatList
              {...testProps("list_notification_center")}
              data={sharingList}
              renderItem={renderNotificationItem}
              keyExtractor={(item) => String(item.id)}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <EmptyState
              message={t("user.notifications.noNotification")}
              qaId="empty_state_notification_center"
            />
          ))}
      </ScreenWrapper>
    </>
  );
};

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
  },
});

export { NotificationCenter };
