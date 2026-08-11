/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { useSchedulesList } from "@features/schedule/hooks";
import { useSkeletonReveal } from "@shared/hooks/useSkeletonReveal";
import { SKELETON_REVEAL_PHASE_READY } from "@shared/utils/constants";
import { testProps } from "@shared/utils/testProps";

// Components
import {
  Header,
  ScreenWrapper,
  Button,
  InputDialog,
} from "@shared/components";
import {
  SchedulesHeaderActions,
  SchedulesList,
  SchedulesEmptyState,
  SchedulesLoadingSkeleton,
} from "@features/schedule/components";

/**
 * SchedulesScreen
 *
 * Displays and manages schedules. Initial load uses a mild skeleton collapse
 * then content slide-up; pull-to-refresh keeps RefreshControl only.
 */
export const SchedulesScreen = observer(() => {
  const { t } = useTranslation();
  const {
    schedulesList,
    isLoading,
    isRefreshing,
    isEditing,
    scheduleLoadingStates,
    isScheduleNameDialogVisible,
    scheduleName,
    refreshSchedules,
    setIsEditing,
    handleAddSchedule,
    handleScheduleNameConfirm,
    handleScheduleAction,
    setIsScheduleNameDialogVisible,
  } = useSchedulesList();

  const {
    showSkeleton,
    showContent,
    phase,
    skeletonAnimatedStyle,
    contentAnimatedStyle,
    onSkeletonLayout,
  } = useSkeletonReveal(isLoading);

  const hasSchedules = schedulesList.length > 0;
  const showFooter = phase === SKELETON_REVEAL_PHASE_READY;

  return (
    <>
      <Header
        label={t("schedule.schedules.title")}
        showBack={false}
        rightSlot={
          <SchedulesHeaderActions
            hasSchedules={hasSchedules}
            isEditing={isEditing}
            onEditToggle={() => setIsEditing(!isEditing)}
          />
        }
      />

      <ScreenWrapper style={styles.container} dismissKeyboard={false}>
        {showSkeleton && (
          <Animated.View
            {...testProps("view_schedules_skeleton_reveal")}
            style={[styles.skeletonSlot, skeletonAnimatedStyle]}
          >
            <View onLayout={onSkeletonLayout}>
              <SchedulesLoadingSkeleton />
            </View>
          </Animated.View>
        )}

        {showContent && (
          <Animated.View style={contentAnimatedStyle}>
            {hasSchedules ? (
              <SchedulesList
                schedules={schedulesList}
                refreshing={isRefreshing}
                isEditing={isEditing}
                scheduleLoadingStates={scheduleLoadingStates}
                onRefresh={refreshSchedules}
                onScheduleAction={handleScheduleAction}
              />
            ) : (
              <View
                {...testProps("view_schedules_empty")}
                style={globalStyles.flex1}
              >
                <SchedulesEmptyState
                  refreshing={isRefreshing}
                  onRefresh={refreshSchedules}
                />
              </View>
            )}
          </Animated.View>
        )}

        {showFooter && (
          <View style={globalStyles.footerAddButtonContainer}>
            <Button
              label={t("schedule.schedules.addSchedule")}
              onPress={handleAddSchedule}
              style={globalStyles.footerAddButton}
              qaId="button_add_schedules"
            />
          </View>
        )}
      </ScreenWrapper>

      <InputDialog
        qaId="create_schedule"
        open={isScheduleNameDialogVisible}
        title={t("schedule.schedules.createSchedule")}
        inputPlaceholder={t("schedule.schedules.scheduleNamePlaceholder")}
        confirmLabel={t("layout.shared.next")}
        cancelLabel={t("layout.shared.cancel")}
        onSubmit={handleScheduleNameConfirm}
        onCancel={() => setIsScheduleNameDialogVisible(false)}
        initialValue={scheduleName}
      />
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg5,
  },
  skeletonSlot: {
    width: "100%",
  },
});
