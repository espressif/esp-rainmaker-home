/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import TimePicker from "@shared/components/Form/TimePicker";

// Styles
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { useSchedule } from "@context/schedules.context";
import { useCreateSchedule } from "@features/schedule/hooks";

// Components
import {
  ScreenWrapper,
  Header,
  UnsavedChangesDialog,
} from "@shared/components";
import {
  ScheduleTime,
  ScheduleDays,
  ScheduleNameInput,
  ScheduleWarningBanner,
  ScheduleActionsList,
  ScheduleCreateEmptyState,
  ScheduleActionButtons,
} from "@features/schedule/components";

/**
 * CreateScheduleScreen
 *
 * A screen component for creating and editing schedules.
 * Allows users to define schedule actions for multiple devices.
 *
 * Features:
 * - Create new schedules with custom names and actions
 * - Edit existing schedules
 * - Add/modify device actions
 * - Delete schedules
 * - Set schedule timing and repeat options
 */
export function CreateScheduleScreen() {
  const { t } = useTranslation();
  const { setScheduleName } = useSchedule();
  const {
    state,
    selectedDays,
    showTimePicker,
    loading,
    warning,
    disableActionButton,
    scheduleActions,
    isDiscardDialogOpen,
    confirmDiscard,
    cancelDiscard,
    handleSave,
    handleDelete,
    handleAddDeviceAction,
    handleBackPress,
    handleDayToggle,
    handleTimeSelected,
    setShowTimePicker,
    initialHour,
    initialMinute,
    initialPeriod,
  } = useCreateSchedule();
  return (
    <>
      <Header
        label={
          state.isEditing
            ? t("schedule.createSchedule.editSchedule")
            : t("schedule.createSchedule.title")
        }
        showBack={true}
        onBackPress={handleBackPress}
      />
      <ScreenWrapper style={globalStyles.container}>
        <ScheduleWarningBanner warning={warning} />

        {/* SCHEDULE NAME */}
        <ScheduleNameInput
          scheduleName={state.scheduleName}
          onNameChange={setScheduleName}
        />

        {/* TIME SECTION */}
        <ScheduleTime
          minutes={state.triggers[0]?.m || 0}
          onTimePress={() => setShowTimePicker(true)}
        />

        {/* REPEAT SECTION */}
        <ScheduleDays
          selectedDays={selectedDays}
          onDayPress={handleDayToggle}
        />

        {/* SCHEDULE ACTIONS */}
        <ScheduleActionsList
          scheduleActions={scheduleActions}
          onAddDeviceAction={handleAddDeviceAction}
        />

        {scheduleActions.length === 0 && (
          <ScheduleCreateEmptyState
            title={t("schedule.createSchedule.noActionsSelected")}
            description={t(
              "schedule.createSchedule.noActionsSelectedDescription",
            )}
          />
        )}

        {/* ACTION BUTTONS */}
        <ScheduleActionButtons
          isEditing={state.isEditing}
          loading={loading}
          disableActionButton={disableActionButton}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </ScreenWrapper>

      {/* Time Picker Modal */}
      <TimePicker
        visible={showTimePicker}
        onClose={() => setShowTimePicker(false)}
        onTimeSelected={handleTimeSelected}
        initialHour={initialHour}
        initialMinute={initialMinute}
        initialPeriod={initialPeriod}
      />

      <UnsavedChangesDialog
        open={isDiscardDialogOpen}
        onDiscard={confirmDiscard}
        onKeepEditing={cancelDiscard}
        qaId="create_schedule_unsaved_changes"
      />
    </>
  );
}
