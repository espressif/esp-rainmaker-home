/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSchedule } from "@context/schedules.context";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import {
  useUnsavedChangesGuard,
  useDraftBaseline,
} from "@shared/hooks/useUnsavedChangesGuard";
import { stableStringify } from "@shared/utils/common";
import { LoadingState } from "@src/types/global";
import {
  SCHEDULE_RELATIVE_DEFAULT_SECONDS,
  SCHEDULE_TRIGGER_MODE_RELATIVE,
} from "@shared/utils/constants";
import {
  convertDaysBitmapToArray,
  convertDaysArrayToBitmap,
  convertTimeToMinutes,
  convertMinutesToTime,
  getCurrentTimeInMinutes,
  getScheduleTriggerMode,
  relativeHoursMinutesToSeconds,
  splitRelativeSeconds,
  validateScheduleData,
} from "@features/schedule/utils/scheduleHelper";
import type { ScheduleTriggerMode } from "@src/types/global";

/**
 * Hook for CreateSchedule screen
 * Manages schedule creation and editing logic
 */
export const useCreateSchedule = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const {
    store: { scheduleStore },
  } = useCDF();
  const { scheduleName: paramScheduleName, scheduleId: paramScheduleId } =
    useLocalSearchParams();
  const {
    state,
    initializeSchedule,
    handleSaveSchedule,
    handleDeleteSchedule,
    checkOfflineNodes,
    setScheduleName,
    setTriggers,
    resetState,
    getScheduleActions,
    setScheduleInfo,
  } = useSchedule();

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showRelativeTimePicker, setShowRelativeTimePicker] = useState(false);
  const [loading, setLoading] = useState<LoadingState>({
    save: false,
    delete: false,
  });
  // Flips in the same batch as the init-effect dispatches below (edit-mode
  // load / create-mode defaults), so the unsaved-changes baseline never
  // captures a half-initialized draft.
  const [isDraftReady, setIsDraftReady] = useState(false);

  const triggerMode = useMemo(
    () => getScheduleTriggerMode(state.triggers),
    [state.triggers],
  );

  /** Last relative offset chosen or loaded; restored when toggling back from fixed. */
  const lastRelativeSecondsRef = useRef<number>(
    SCHEDULE_RELATIVE_DEFAULT_SECONDS,
  );

  useEffect(() => {
    const rsec = state.triggers[0]?.rsec;
    if (rsec !== undefined) {
      lastRelativeSecondsRef.current = rsec;
    }
  }, [state.triggers]);

  // Convert days bitmap to array for UI
  const selectedDays = useMemo(() => {
    return state.triggers[0]?.d
      ? convertDaysBitmapToArray(state.triggers[0].d)
      : [];
  }, [state.triggers]);

  // Initialize schedule on mount
  useEffect(() => {
    const initSchedule = async () => {
      if (paramScheduleId) {
        // Edit mode - fetch schedule data
        const schedule =
          scheduleStore.schedulesByID?.[paramScheduleId as string];
        if (schedule) {
          setScheduleInfo({
            id: schedule.id,
            name: schedule.name,
            actions: schedule.action,
            nodes: schedule.nodes,
            enabled: schedule.enabled,
            triggers: schedule.triggers,
            validity: schedule.validity,
            info: schedule.info,
            flags: schedule.flags,
            outOfSyncMeta: schedule.outOfSyncMeta,
          });
        }
      } else {
        // Create mode - initialize new schedule
        initializeSchedule();
        // Initialize with current time
        const minutes = getCurrentTimeInMinutes();
        setTriggers([{ m: minutes, d: 0 }]);
      }
    };

    initSchedule();
    setIsDraftReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [paramScheduleId]);

  // Set schedule name from params
  useEffect(() => {
    if (paramScheduleName) {
      setScheduleName(paramScheduleName as string);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [paramScheduleName]);

  const hasUnsavedChanges = useDraftBaseline(
    stableStringify({
      name: (state.scheduleName ?? "").trim(),
      triggers: state.triggers,
      actions: state.actions,
    }),
    isDraftReady,
  );

  const navigateToSchedules = useCallback(() => {
    router.dismissTo("/(schedule)/Schedules");
  }, [router]);

  const {
    isDiscardDialogOpen,
    exit: exitToSchedules,
    requestExit: handleBackPress,
    confirmDiscard,
    cancelDiscard,
  } = useUnsavedChangesGuard({
    hasUnsavedChanges,
    onExit: navigateToSchedules,
  });

  /**
   * The draft lives in shared context, so resetting it while this screen is
   * still visible blanks the form during the dismiss transition. Reset only
   * on unmount, which fires after the screen has left (any removal path).
   */
  useEffect(() => () => resetState(), [resetState]);

  // Handle save schedule
  const handleSave = async () => {
    setLoading((prev) => ({ ...prev, save: true }));
    try {
      const validation = validateScheduleData(
        state.scheduleName,
        state.triggers,
        state.actions,
      );
      if (!validation.isValid && validation.error) {
        toast.showError(t(validation.error));
        return;
      }

      const success = await handleSaveSchedule();
      if (success) {
        exitToSchedules();
      }
    } finally {
      setLoading((prev) => ({ ...prev, save: false }));
    }
  };

  // Handle delete schedule
  const handleDelete = async () => {
    setLoading((prev) => ({ ...prev, delete: true }));
    try {
      const success = await handleDeleteSchedule();
      if (success) {
        exitToSchedules();
      }
    } finally {
      setLoading((prev) => ({ ...prev, delete: false }));
    }
  };

  // Handle add device action navigation
  const handleAddDeviceAction = () => {
    router.push({
      pathname: "/(schedule)/ScheduleDeviceSelection",
    } as any);
  };

  /**
   * Switches between fixed and relative trigger modes while preserving the
   * last relative offset across toggles (mirrors fixed mode keeping m/d).
   */
  const handleTriggerModeChange = (mode: ScheduleTriggerMode) => {
    if (mode === SCHEDULE_TRIGGER_MODE_RELATIVE) {
      setTriggers([{ rsec: lastRelativeSecondsRef.current }]);
      return;
    }

    if (state.triggers[0]?.rsec !== undefined) {
      lastRelativeSecondsRef.current = state.triggers[0].rsec;
    }

    const minutes = state.triggers[0]?.m ?? getCurrentTimeInMinutes();
    const daysBitmap = state.triggers[0]?.d ?? 0;
    setTriggers([{ m: minutes, d: daysBitmap }]);
  };

  const handleRelativeTimeSelected = (hours: number, minutes: number) => {
    const rsec = relativeHoursMinutesToSeconds(hours, minutes);
    setTriggers([{ rsec }]);
    setShowRelativeTimePicker(false);
  };

  // Handle day toggle
  const handleDayToggle = (index: number) => {
    const newDays = selectedDays.includes(index)
      ? selectedDays.filter((d) => d !== index)
      : [...selectedDays, index];
    const daysBitmap = convertDaysArrayToBitmap(newDays);
    setTriggers([
      {
        ...state.triggers[0],
        d: daysBitmap,
      },
    ]);
  };

  // Handle time selection from picker
  const handleTimeSelected = (
    hours: number,
    minutes: number,
    period: "AM" | "PM",
  ) => {
    const totalMinutes = convertTimeToMinutes(hours, minutes, period);
    setTriggers([
      {
        ...state.triggers[0],
        m: totalMinutes,
      },
    ]);
    setShowTimePicker(false);
  };

  // Get initial time picker values
  const getInitialTimePickerValues = () => {
    if (state.triggers[0]?.m) {
      const { hour, minute, period } = convertMinutesToTime(
        state.triggers[0].m,
      );
      return {
        initialHour: hour,
        initialMinute: minute,
        initialPeriod: period,
      };
    }
    return {
      initialHour: 12,
      initialMinute: 0,
      initialPeriod: "AM" as const,
    };
  };

  // Check if save button should be disabled
  const disableActionButton = useMemo(() => {
    return (
      loading.save || !state.scheduleName || getScheduleActions().length === 0
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [loading.save, state.scheduleName, getScheduleActions().length]);

  // Get warning message for offline nodes
  const warning = useMemo(() => {
    if (checkOfflineNodes()) {
      return t("schedule.schedules.someDevicesNotConnected");
    }
    return "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [state.nodes, checkOfflineNodes]);

  const relativeSeconds =
    state.triggers[0]?.rsec ?? SCHEDULE_RELATIVE_DEFAULT_SECONDS;
  const { hours: relativeInitialHours, minutes: relativeInitialMinutes } =
    splitRelativeSeconds(relativeSeconds);

  return {
    // State
    state,
    triggerMode,
    selectedDays,
    showTimePicker,
    showRelativeTimePicker,
    relativeSeconds,
    relativeInitialHours,
    relativeInitialMinutes,
    loading,
    warning,
    disableActionButton,
    scheduleActions: getScheduleActions(),
    // Unsaved changes
    isDiscardDialogOpen,
    confirmDiscard,
    cancelDiscard,
    // Handlers
    handleSave,
    handleDelete,
    handleAddDeviceAction,
    handleBackPress,
    handleDayToggle,
    handleTimeSelected,
    handleTriggerModeChange,
    handleRelativeTimeSelected,
    setShowTimePicker,
    setShowRelativeTimePicker,
    // Time picker
    ...getInitialTimePickerValues(),
  };
};
