/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { useFocusEffect } from "expo-router";
import type { TFunction } from "i18next";
import type { ESPCDFGroup } from "@store";
import {
  validateHomeNameForCreation,
  getHomeDescriptionCounts,
  formatHomeDescription as formatHomeDescriptionUtil,
  HOME_NAME_VALIDATION_ERROR_KEYS,
  type HomeNameValidationError,
  type HomeDescriptionCounts,
} from "@features/group/utils/homeManagement";
import { useCDF } from "@shared/hooks/useCDF";
import { loadHomeNodes } from "@features/group/utils/homeNodes";

// --- Result types (structured outcomes for UI to interpret) ---

export type CreateHomeResult =
  | { status: "success" }
  | { status: "validationError"; errorKey: HomeNameValidationError }
  | { status: "error" };

export type RefreshHomesResult = { status: "success" } | { status: "error" };

export type { HomeNameValidationError, HomeDescriptionCounts };

export interface UseHomeManagementResult {
  homes: ESPCDFGroup[];
  showDialog: boolean;
  setShowDialog: (open: boolean) => void;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<RefreshHomesResult>;
  createHome: (newHomeName: string) => Promise<CreateHomeResult>;
  getHomeDescription: (home: ESPCDFGroup) => HomeDescriptionCounts;
  /** When options provided: handlers that handle toast and close dialog */
  handleCreateHome?: (newHomeName: string) => Promise<void>;
  handleRefresh?: () => Promise<void>;
  /** Formatted description for a home (device/group/room counts); requires options. */
  formatHomeDescription?: (home: ESPCDFGroup) => string;
}

export interface UseHomeManagementOptions {
  toast: {
    showSuccess: (title: string, message?: string) => void;
    showError: (title: string, message?: string) => void;
  };
  t: TFunction;
}

/**
 * Hook that encapsulates Home Management business logic and state.
 * When options (toast, t, labels) are provided, returns handlers and
 * formatHomeDescription so the screen stays thin.
 */
export function useHomeManagement(
  options?: UseHomeManagementOptions
): UseHomeManagementResult {
  const { store, syncHomeWithNodes } = useCDF();

  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const homes = useMemo(() => {
    return store?.groupStore?.groupsList ?? [];
  }, [store?.groupStore?.groupsList]);

  // The home cards count devices from loaded nodes, and nodes are loaded only
  // for homes the user opened. Load the rest here, in the background, one call
  // per home, so the counts are right and the next switch to them is instant.
  const requestedHomeIds = useRef(new Set<string>());
  useFocusEffect(
    useCallback(() => {
      for (const home of homes) {
        const needsNodes = !home.nodeDetails?.length && (home.nodeIds?.length ?? 0) > 0;
        if (needsNodes && !requestedHomeIds.current.has(home.id)) {
          requestedHomeIds.current.add(home.id);
          void loadHomeNodes(home);
        }
      }
    }, [homes])
  );

  const refresh = useCallback(async (): Promise<RefreshHomesResult> => {
    if (!store?.groupStore) return { status: "success" };
    setRefreshing(true);
    try {
      await syncHomeWithNodes({ force: true });
      return { status: "success" };
    } catch {
      return { status: "error" };
    } finally {
      setRefreshing(false);
    }
  }, [store?.groupStore, syncHomeWithNodes]);

  const createHome = useCallback(
    async (newHomeName: string): Promise<CreateHomeResult> => {
      const result = validateHomeNameForCreation(newHomeName, homes);
      if (!result.valid && result.errorKey) {
        return { status: "validationError", errorKey: result.errorKey };
      }

      setLoading(true);
      try {
        const unifiedUser = store?.userStore.user;
        if (unifiedUser?.createHome) {
          await unifiedUser.createHome({
            name: newHomeName.trim()
          });
          return { status: "success" };
        }
        return { status: "error" };
      } catch (error) {
        console.error("Error creating home:", error);
        return { status: "error" };
      } finally {
        setLoading(false);
      }
    },
    [homes, store?.userStore?.user]
  );

  const getHomeDescription = useCallback(
    (home: ESPCDFGroup): HomeDescriptionCounts => {
      const nodesList = store?.nodeStore?.nodesList ?? [];
      return getHomeDescriptionCounts(home, nodesList);
    },
    [store?.nodeStore?.nodesList]
  );

  const handleCreateHome = useCallback(
    async (newHomeName: string) => {
      if (!options) return;
      const result = await createHome(newHomeName);
      if (result.status === "success") {
        options.toast.showSuccess(
          options.t("layout.shared.successHeader"),
          options.t("group.homeManagement.homeCreatedSuccessfully")
        );
        setShowDialog(false);
      }
      if (result.status === "validationError") {
        options.toast.showError(
          options.t("layout.shared.errorHeader"),
          options.t(HOME_NAME_VALIDATION_ERROR_KEYS[result.errorKey])
        );
      }
      if (result.status === "error") {
        options.toast.showError(
          options.t("layout.shared.errorHeader"),
          options.t("group.errors.failedToCreateHome")
        );
      }
    },
    [options, createHome]
  );

  const handleRefresh = useCallback(async () => {
    if (!options) return;
    const result = await refresh();
    if (result.status === "error") {
      options.toast.showError(
        options.t("layout.shared.errorHeader"),
        options.t("group.errors.failedToRefreshHomes")
      );
    }
  }, [options, refresh]);

  const formatHomeDescription = useMemo(() => {
    if (!options) return undefined;
    return (home: ESPCDFGroup) =>
      formatHomeDescriptionUtil(
        getHomeDescription(home),
        options.t("group.homeManagement.deviceCountPostfix"),
        options.t("group.homeManagement.roomCountPostfix")
      );
  }, [options, getHomeDescription]);

  return {
    homes,
    showDialog,
    setShowDialog,
    loading,
    refreshing,
    refresh,
    createHome,
    getHomeDescription,
    ...(options && {
      handleCreateHome,
      handleRefresh,
      formatHomeDescription,
    }),
  };
}
