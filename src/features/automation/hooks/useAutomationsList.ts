/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useRef } from "react";
import type { TFunction } from "i18next";
import type { ESPCDFAutomation } from "@store";
import {
  filterAutomationsByCurrentHomeNodes,
  validateAutomationName,
} from "@features/automation/utils/automationManagement";
import { useCDF } from "@shared/hooks/useCDF";
import { isAutomationsSupportedForGroupUserAccess } from "@shared/utils/groupAccess";

/**
 * Resolves automation error copy for toasts: `description` may be an i18next key (e.g. from RainMaker Neo adaptor) or plain API text.
 * Missing keys fall back to the input string per i18next defaults.
 * @param t - i18next translate function
 * @param description - Error description from the store operation, if any
 * @returns Message string for the toast body
 */
function translateAutomationErrorDescription(
  t: TFunction,
  description: string | undefined
): string {
  return description ? t(description) : t("automation.errors.fallback");
}

// --- Result types (structured outcomes for UI to interpret) ---

export type RefreshAutomationsResult =
  | { status: "success" }
  | { status: "error"; description?: string };

export type LoadAutomationsResult =
  | { status: "success" }
  | { status: "error"; description?: string };

export type DeleteAutomationResult =
  | { status: "success" }
  | { status: "error"; description?: string };

export type ToggleAutomationResult =
  | { status: "success" }
  | { status: "error"; description?: string };

export interface UseAutomationsListResult {
  /** Automations filtered for current home's nodes */
  filteredAutomations: ESPCDFAutomation[];
  /** Current home's node IDs */
  nodeList: string[];
  /** Initial load in progress */
  isLoading: boolean;
  /** Pull-to-refresh in progress */
  isRefreshing: boolean;
  /** Per-automation toggle loading (key: automationId) */
  toggleLoadingStates: Record<string, boolean>;
  setToggleLoadingStates: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  /** Currently selected automation for menu */
  selectedAutomation: ESPCDFAutomation | null;
  setSelectedAutomation: React.Dispatch<
    React.SetStateAction<ESPCDFAutomation | null>
  >;
  /** Bottom sheet visibility */
  isBottomSheetVisible: boolean;
  setIsBottomSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  /** Per-automation action loading (key: automationId, value: 'edit' | 'delete') */
  actionLoadingStates: Record<string, string>;
  setActionLoadingStates: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  /** List edit mode (delete affordance on cards, like schedules/scenes) */
  isEditing: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  /** Create automation name dialog visibility */
  isAutomationNameDialogVisible: boolean;
  setIsAutomationNameDialogVisible: React.Dispatch<React.SetStateAction<boolean>>;
  /** Create automation name input value */
  automationName: string;
  setAutomationName: React.Dispatch<React.SetStateAction<string>>;
  /** Refresh automations (pull-to-refresh). Caller handles toast on error. */
  refresh: () => Promise<RefreshAutomationsResult>;
  /** Load automations (e.g. on focus). Caller handles toast on error. */
  loadAutomations: () => Promise<LoadAutomationsResult>;
  /** Delete automation by id. Caller handles toast and loading state. */
  deleteAutomation: (automationId: string) => Promise<DeleteAutomationResult>;
  /** Enable/disable automation. Caller handles toast and loading state. */
  enableAutomation: (
    automation: ESPCDFAutomation,
    enabled: boolean
  ) => Promise<ToggleAutomationResult>;
  /** Get automation by id from store */
  getAutomationById: (automationId: string) => ESPCDFAutomation | undefined;
  /** True when current home is subgroup-only share (RainMaker Neo); Automations screen shows a notice instead of the list. */
  isAutomationsAccessRestricted: boolean;
  /** Handlers and menu options (when options param is provided) */
  handleAutomationAction?: (
    automationId: string,
    action: string
  ) => Promise<void>;
  handleAutomationToggle?: (
    automation: ESPCDFAutomation,
    enabled: boolean
  ) => Promise<void>;
  handleAutomationNameConfirm?: (name: string) => void;
  /** Menu option config (labelKey, action, loading, destructive); screen adds label, icon, onPress */
  automationMenuOptions?: {
    id: string;
    labelKey: string;
    action: string;
    loading: boolean;
    destructive?: boolean;
  }[];
}

export interface UseAutomationsListOptions {
  /** Router (e.g. from useRouter()) for navigation */
  router: { push: (href: unknown) => void };
  toast: {
    showSuccess: (title: string, message?: string) => void;
    showError: (title: string, message?: string) => void;
  };
  t: TFunction;
  resetState: () => void;
}

/**
 * Hook that encapsulates Automations list business logic and state.
 * When options (router, toast, t, resetState) are provided, also returns
 * handlers and menu options so the screen stays thin.
 */
export function useAutomationsList(
  options?: UseAutomationsListOptions
): UseAutomationsListResult {
  const { store } = useCDF();
  const { automationStore } = store;
  const currentHome = store.getCurrentHome();

  const isAutomationsAccessRestricted = useMemo(
    () => !isAutomationsSupportedForGroupUserAccess(currentHome?.accessType),
    [currentHome?.accessType],
  );

  const { automationsList } = automationStore;
  const nodeList = useMemo(
    () => currentHome?.nodeIds ?? [],
    [currentHome?.nodeIds]
  );

  const filteredAutomations = useMemo(
    () => filterAutomationsByCurrentHomeNodes(automationsList, nodeList),
    [automationsList, nodeList]
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toggleLoadingStates, setToggleLoadingStates] = useState<
    Record<string, boolean>
  >({});
  const [selectedAutomation, setSelectedAutomation] =
    useState<ESPCDFAutomation | null>(null);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [actionLoadingStates, setActionLoadingStates] = useState<
    Record<string, string>
  >({});
  const [isEditing, setIsEditing] = useState(false);
  const [isAutomationNameDialogVisible, setIsAutomationNameDialogVisible] =
    useState(false);
  const [automationName, setAutomationName] = useState("");

  const refresh = useCallback(async (): Promise<RefreshAutomationsResult> => {
    setIsRefreshing(true);
    try {
      const home = store.getCurrentHome();
      if (!isAutomationsSupportedForGroupUserAccess(home?.accessType)) {
        return { status: "success" };
      }
      await home?.getAutomations();
      return { status: "success" };
    } catch (error: unknown) {
      const description =
        (error as { description?: string })?.description ?? undefined;
      return { status: "error", description };
    } finally {
      setIsRefreshing(false);
    }
  }, [store]);

  const loadInProgressRef = useRef(false);

  const loadAutomations = useCallback(async (): Promise<LoadAutomationsResult> => {
    if (loadInProgressRef.current) {
      return { status: "success" };
    }
    loadInProgressRef.current = true;
    setIsLoading(true);
    try {
      const home = store.getCurrentHome();
      if (!isAutomationsSupportedForGroupUserAccess(home?.accessType)) {
        return { status: "success" };
      }
      await home?.getAutomations();
      return { status: "success" };
    } catch (error: unknown) {
      const description =
        (error as { description?: string })?.description ?? undefined;
      return { status: "error", description };
    } finally {
      loadInProgressRef.current = false;
      setIsLoading(false);
    }
  }, [store]);

  const deleteAutomation = useCallback(
    async (automationId: string): Promise<DeleteAutomationResult> => {
      const automation = automationStore.getAutomationById(automationId);
      if (!automation) return { status: "error" };

      try {
        await automation.delete();
        return { status: "success" };
      } catch (error: unknown) {
        const description =
          (error as { description?: string })?.description ?? undefined;
        return { status: "error", description };
      }
    },
    [automationStore]
  );

  const enableAutomation = useCallback(
    async (
      automation: ESPCDFAutomation,
      enabled: boolean
    ): Promise<ToggleAutomationResult> => {
      const automationId = automation.id;
      if (!automationId) return { status: "error" };

      try {
        await automation.enable(enabled);
        return { status: "success" };
      } catch (error: unknown) {
        const description =
          (error as { description?: string })?.description ?? undefined;
        return { status: "error", description };
      }
    },
    []
  );

  const getAutomationById = useCallback(
    (automationId: string) => automationStore.getAutomationById(automationId),
    [automationStore]
  );

  const handleAutomationAction = useCallback(
    async (automationId: string, action: string) => {
      if (!options) return;
      const automation = automationStore.getAutomationById(automationId);
      if (!automation) return;

      setActionLoadingStates((prev) => ({ ...prev, [automationId]: action }));

      try {
        if (action === "edit") {
          options.router.push({
            pathname: "/(automation)/CreateAutomation",
            params: {
              automationId: automation.id,
              isEditing: "true",
            },
          });
        } else if (action === "delete") {
          const result = await deleteAutomation(automationId);
          if (result.status === "success") {
            options.toast.showSuccess(
              options.t("automation.automations.automationDeleted"),
              options.t("automation.automations.automationDeletedMessage")
            );
          } else {
            options.toast.showError(
              options.t("automation.errors.failedToActionAutomation", {
                action,
              }),
              translateAutomationErrorDescription(
                options.t,
                result.description
              )
            );
          }
        }
      } finally {
        setTimeout(() => {
          setActionLoadingStates((prev) => {
            const next = { ...prev };
            delete next[automationId];
            return next;
          });
          setIsBottomSheetVisible(false);
          setSelectedAutomation(null);
        }, 1000);
      }
    },
    [
      options,
      automationStore,
      deleteAutomation,
      setActionLoadingStates,
      setIsBottomSheetVisible,
      setSelectedAutomation,
    ]
  );

  const handleAutomationToggle = useCallback(
    async (automation: ESPCDFAutomation, enabled: boolean) => {
      if (!options) return;
      const automationId = automation.id;
      if (!automationId) return;

      setToggleLoadingStates((prev) => ({ ...prev, [automationId]: true }));

      try {
        const result = await enableAutomation(automation, enabled);
        if (result.status === "success") {
          options.toast.showSuccess(
            enabled
              ? options.t("automation.automations.automationEnabled")
              : options.t("automation.automations.automationDisabled"),
            enabled
              ? options.t("automation.automations.automationEnabledMessage")
              : options.t("automation.automations.automationDisabledMessage")
          );
        } else {
          options.toast.showError(
            options.t("automation.errors.failedToActionAutomation", {
              action: enabled ? "enable" : "disable",
            }),
            translateAutomationErrorDescription(
              options.t,
              result.description
            )
          );
        }
      } finally {
        setToggleLoadingStates((prev) => {
          const next = { ...prev };
          delete next[automationId];
          return next;
        });
      }
    },
    [options, enableAutomation, setToggleLoadingStates]
  );

  const handleAutomationNameConfirm = useCallback(
    (name: string) => {
      if (!options) return;
      const validation = validateAutomationName(name);
      if (!validation.valid) return;

      options.resetState();
      setIsAutomationNameDialogVisible(false);
      options.router.push({
        pathname: "/(automation)/CreateAutomation",
        params: { automationName: name.trim() },
      });
    },
    [options, setIsAutomationNameDialogVisible]
  );

  const automationMenuOptions = useMemo(() => {
    if (!options || !selectedAutomation) return undefined;
    const automationId = selectedAutomation.id ?? "";
    return [
      {
        id: "edit",
        labelKey: "automation.automations.edit",
        action: "edit",
        loading: actionLoadingStates[automationId] === "edit",
      },
      {
        id: "delete",
        labelKey: "automation.automations.delete",
        action: "delete",
        loading: actionLoadingStates[automationId] === "delete",
        destructive: true,
      },
    ];
  }, [options, selectedAutomation, actionLoadingStates]);

  return {
    filteredAutomations,
    nodeList,
    isAutomationsAccessRestricted,
    isLoading,
    isRefreshing,
    toggleLoadingStates,
    setToggleLoadingStates,
    selectedAutomation,
    setSelectedAutomation,
    isBottomSheetVisible,
    setIsBottomSheetVisible,
    actionLoadingStates,
    setActionLoadingStates,
    isEditing,
    setIsEditing,
    isAutomationNameDialogVisible,
    setIsAutomationNameDialogVisible,
    automationName,
    setAutomationName,
    refresh,
    loadAutomations,
    deleteAutomation,
    enableAutomation,
    getAutomationById,
    ...(options && {
      handleAutomationAction,
      handleAutomationToggle,
      handleAutomationNameConfirm,
      automationMenuOptions,
    }),
  };
}
