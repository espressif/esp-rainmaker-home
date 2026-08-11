/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useTranslation } from "react-i18next";
import { LayoutPanelLeft } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

interface SchedulesEmptyStateProps {
  /** True while pull-to-refresh is in progress */
  refreshing: boolean;
  /** Pull-to-refresh handler */
  onRefresh: () => void;
}

/**
 * Empty schedules state with its own ScrollView + RefreshControl.
 * Initial-load skeleton is owned by the Schedules screen reveal transition.
 * @param props - Refresh flags and handler
 * @returns Scrollable empty-state UI for the schedules screen
 */
export const SchedulesEmptyState = ({
  refreshing,
  onRefresh,
}: SchedulesEmptyStateProps) => {
  const { t } = useTranslation();

  return (
    <ScrollView
      {...testProps("scroll_schedules_empty")}
      style={globalStyles.schedulesScrollView}
      contentContainerStyle={[{ flexGrow: 1 }, { paddingBottom: 150 }]}
      showsVerticalScrollIndicator={false}
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
    >
      <Pressable
        {...testProps("view_empty_schedules")}
        style={globalStyles.sceneEmptyStateContainer}
      >
        <View style={globalStyles.sceneEmptyStateIconContainerTop}>
          <LayoutPanelLeft size={35} color={tokens.colors.primary} />
        </View>
        <Text
          {...testProps("text_title_empty")}
          style={globalStyles.emptyStateTitle}
        >
          {t("schedule.schedules.noSchedulesYet")}
        </Text>
        <Text
          {...testProps("text_description_empty")}
          style={globalStyles.emptyStateDescription}
        >
          {t("schedule.schedules.noSchedulesYetDescription")}
        </Text>
      </Pressable>
    </ScrollView>
  );
};
