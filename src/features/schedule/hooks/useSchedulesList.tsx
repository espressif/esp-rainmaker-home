/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useRef, useEffect } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useObserver } from "mobx-react-lite";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { useFocusEffect } from "@react-navigation/native";
import { useSchedule } from "@context/schedules.context";
import type { ESPCDFSchedule } from "@store";

/**
 * Hook for Schedules list screen
 * Manages schedule list fetching and actions
 */
export const useSchedulesList = () => {
  const toast = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const { store } = useCDF();
  const { resetState } = useSchedule();
  const { scheduleStore } = store;

  // Refs to store latest values for stable callbacks
  // MobX stores are stable, so we can use them directly
  // Only toast and t need refs since they might change
  const toastRef = useRef(toast);
  const tRef = useRef(t);

  // Initialize refs immediately
  toastRef.current = toast;
  tRef.current = t;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFetchingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [scheduleLoadingStates, setScheduleLoadingStates] = useState<
    Record<string, string>
  >({});
  const [isScheduleNameDialogVisible, setIsScheduleNameDialogVisible] =
    useState(false);
  const [scheduleName, setScheduleName] = useState("");

  /**
   * Loads schedules for initial / focus fetch (shows full-screen loader).
   * Clears the store first so UI does not briefly show stale items.
   * Stable callback (no deps) to avoid useFocusEffect recursion.
   */
  const loadSchedules = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      setIsLoading(true);
      scheduleStore.clear();

      const currentHome = store.getCurrentHome();
      if (currentHome && currentHome.operations.getSchedules) {
        await currentHome.getSchedules();
      }
    } catch (error) {
      console.error("Error fetching schedules:", error);
      if (toastRef.current && tRef.current) {
        toastRef.current.showError(tRef.current("schedule.errors.fallback"));
      }
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, []);

  /**
   * Soft refresh for pull-to-refresh / header refresh (RefreshControl only).
   * Does not clear the list or toggle isLoading (same as automations).
   */
  const refreshSchedules = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      setIsRefreshing(true);
      const currentHome = store.getCurrentHome();
      if (currentHome && currentHome.operations.getSchedules) {
        await currentHome.getSchedules();
      }
    } catch (error) {
      console.error("Error refreshing schedules:", error);
      if (toastRef.current && tRef.current) {
        toastRef.current.showError(tRef.current("schedule.errors.fallback"));
      }
    } finally {
      isFetchingRef.current = false;
      setIsRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, []);

  // Update refs when values change (after load/refresh are defined)
  useEffect(() => {
    toastRef.current = toast;
    tRef.current = t;
  }, [toast, t]);

  /**
   * Effect: Loads schedules when screen comes into focus.
   * Empty deps so this runs only on focus change.
   */
  useFocusEffect(
    useCallback(() => {
      loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
    }, []),
  );

  // Handle add schedule
  const handleAddSchedule = () => {
    resetState();
    setScheduleName("");
    setIsScheduleNameDialogVisible(true);
  };

  // Handle schedule name confirmation
  const handleScheduleNameConfirm = (name: string) => {
    if (name.trim()) {
      setIsScheduleNameDialogVisible(false);
      router.push({
        pathname: "/(schedule)/CreateSchedule",
        params: {
          scheduleName: name.trim(),
        },
      } as any);
    }
  };

  // Handle schedule action (enable/disable/edit/delete)
  const handleScheduleAction = async (
    schedule: ESPCDFSchedule,
    action: string,
  ) => {
    if (!schedule) return;
    setScheduleLoadingStates((prev) => ({ ...prev, [schedule.id]: action }));

    try {
      switch (action) {
        case "enable": {
          await schedule.enable();
          toastRef.current?.showSuccess(
            tRef.current("schedule.schedules.scheduleEnabledSuccessfully"),
          );
          break;
        }
        case "disable": {
          await schedule.disable();
          toastRef.current?.showSuccess(
            tRef.current("schedule.schedules.scheduleDisabledSuccessfully"),
          );
          break;
        }
        case "edit": {
          router.push({
            pathname: "/(schedule)/CreateSchedule",
            params: {
              scheduleName: schedule.name,
              scheduleId: schedule.id,
            },
          } as any);
          break;
        }
        case "delete": {
          await schedule.remove();
          toastRef.current?.showSuccess(
            tRef.current("schedule.schedules.scheduleDeletedSuccessfully"),
          );
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error(`Error performing ${action} on schedule:`, error);
      toastRef.current?.showError(tRef.current("schedule.errors.fallback"));
    } finally {
      setTimeout(() => {
        setScheduleLoadingStates((prev) => {
          const newState = { ...prev };
          delete newState[schedule.id];
          return newState;
        });
      }, 1000);
    }
  };

  /**
   * Get schedules list from store
   * Use useObserver to track MobX observable changes
   * When schedules are added/updated in the store via getSchedules(), this will automatically update
   */
  const schedulesList = useObserver(() => {
    // Access scheduleStore.schedulesList inside useObserver to track MobX observable changes
    return scheduleStore.schedulesList;
  });

  return {
    schedulesList,
    isLoading,
    isRefreshing,
    isEditing,
    scheduleLoadingStates,
    isScheduleNameDialogVisible,
    scheduleName,
    loadSchedules,
    refreshSchedules,
    setIsEditing,
    handleAddSchedule,
    handleScheduleNameConfirm,
    handleScheduleAction,
    setIsScheduleNameDialogVisible,
    setScheduleName,
  };
};
