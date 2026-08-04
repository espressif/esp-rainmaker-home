/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { ESPCDFDevice } from "@store";
import {
  getEventInfoFromEvents,
  isCreateAutomationValid,
  getActionCardsFromActions,
  type CreateAutomationEventInfo,
  type CreateAutomationActionCard,
} from "@features/automation/utils/automationManagement";
import { useCDF } from "@shared/hooks/useCDF";
import { stableStringify } from "@shared/utils/common";
import { useDraftBaseline } from "@shared/hooks/useUnsavedChangesGuard";
import { useAutomation } from "@context/automation.context";

// --- Result types (structured outcomes for UI to interpret) ---

export type CreateAutomationResult =
  | { status: "success" }
  | { status: "error"; description?: string };

export type UpdateAutomationResult =
  | { status: "success" }
  | { status: "error"; description?: string };

export type DeleteAutomationResult =
  | { status: "success" }
  | { status: "error"; description?: string };

export interface UseCreateAutomationParams {
  automationName?: string;
  automationId?: string;
  isEditing?: string;
}

type AutomationDraftState = ReturnType<typeof useAutomation>["state"];

/**
 * Serializes the fields the user can edit on the Create Automation screen,
 * for unsaved-changes comparison against a baseline snapshot.
 */
function serializeAutomationDraft(state: AutomationDraftState): string {
  return stableStringify({
    name: (state.automationName ?? "").trim(),
    retrigger: state.retrigger,
    events: state.events,
    actions: state.actions,
  });
}

/**
 * Create mode: the flow starts from a reset state with only the name passed
 * as a route param, so any deviation from that means the user has edits to
 * lose.
 */
function hasUnsavedCreateModeChanges(
  state: AutomationDraftState,
  paramAutomationName?: string
): boolean {
  return (
    (state.automationName ?? "").trim() !==
      (paramAutomationName ?? "").trim() ||
    state.retrigger ||
    state.events.length > 0 ||
    Object.keys(state.actions).length > 0
  );
}

export interface UseCreateAutomationResult {
  /** Context state */
  state: ReturnType<typeof useAutomation>["state"];
  /** Context setters used by screen */
  setAutomationName: ReturnType<typeof useAutomation>["setAutomationName"];
  setRetrigger: ReturnType<typeof useAutomation>["setRetrigger"];
  /** Loading flags */
  loading: { save: boolean; delete: boolean };
  /** Whether form is valid to submit */
  isValidAutomation: boolean;
  /** Whether the user has edits that are not persisted yet */
  hasUnsavedChanges: boolean;
  /** First event info for UI (device param event) */
  eventInfo: CreateAutomationEventInfo | null;
  /** Device for event (from store) for display */
  eventDevice: ESPCDFDevice | null;
  /** Action cards for list UI */
  actionCards: CreateAutomationActionCard[];
  /** Create new automation. Caller handles toast and navigation. */
  createAutomation: () => Promise<CreateAutomationResult>;
  /** Update existing automation. Caller handles toast and navigation. */
  updateAutomation: () => Promise<UpdateAutomationResult>;
  /** Delete automation. Caller handles toast and navigation. */
  deleteAutomation: () => Promise<DeleteAutomationResult>;
}

/**
 * Hook that encapsulates Create Automation business logic and derived state.
 * No UI side effects (toast, navigation, i18n). Returns structured results
 * for the screen to interpret and display.
 */
export function useCreateAutomation(
  params: UseCreateAutomationParams
): UseCreateAutomationResult {
  const { automationName: paramAutomationName, automationId, isEditing } = params;
  const { store } = useCDF();
  const {
    state,
    setAutomationName,
    setRetrigger,
    setAutomationInfo,
    updateAutomation: contextUpdateAutomation,
    deleteAutomation: contextDeleteAutomation,
    createAutomation: contextCreateAutomation,
  } = useAutomation();

  const automationStore = store.automationStore;
  const automationLoadedRef = useRef(false);

  const [loading, setLoading] = useState({ save: false, delete: false });
  // Flips in the same batch as the edit-load dispatches, so the baseline in
  // useDraftBaseline never captures a half-loaded draft.
  const [isEditLoaded, setIsEditLoaded] = useState(false);

  const currentHome = store.getCurrentHome();
  const currentHomeNodeList = useMemo(
    () => currentHome?.nodeIds ?? [],
    [currentHome?.nodeIds]
  );

  // Sync automation name from route params
  useEffect(() => {
    if (paramAutomationName) {
      setAutomationName(paramAutomationName as string);
    }
  }, [paramAutomationName, setAutomationName]);

  // Load automation for edit (once)
  useEffect(() => {
    if (
      isEditing === "true" &&
      automationId &&
      !automationLoadedRef.current
    ) {
      const automation = automationStore.getAutomationById(automationId as string);
      if (automation) {
        setAutomationInfo(automation);
        automationLoadedRef.current = true;
        setIsEditLoaded(true);
      }
    }
  }, [isEditing, automationId, automationStore, setAutomationInfo]);

  const isEditDraftDirty = useDraftBaseline(
    serializeAutomationDraft(state),
    isEditLoaded
  );

  const eventInfo = useMemo(
    () => getEventInfoFromEvents(state.events),
    [state.events]
  );

  const eventDevice = useMemo((): ESPCDFDevice | null => {
    if (!eventInfo || !state.nodeId) return null;
    const node = store.nodeStore.nodesByIDMap?.[state.nodeId];
    if (!node?.devices) return null;
    const device = node.devices.find((d) => d.name === eventInfo!.deviceName);
    return device ?? null;
  }, [eventInfo, state.nodeId, store.nodeStore.nodesByIDMap]);

  const actionCards = useMemo(
    () =>
      getActionCardsFromActions(
        state.actions as Record<string, Record<string, Record<string, unknown>>>,
        currentHomeNodeList,
        store.nodeStore.nodesByIDMap ?? {}
      ),
    [
      state.actions,
      currentHomeNodeList,
      store.nodeStore.nodesByIDMap,
    ]
  );

  const isValidAutomation = useMemo(
    () =>
      isCreateAutomationValid(
        state.automationName ?? "",
        state.events.length,
        Object.keys(state.actions).length
      ),
    [state.automationName, state.events.length, state.actions]
  );

  const hasUnsavedChanges =
    isEditing === "true"
      ? isEditDraftDirty
      : hasUnsavedCreateModeChanges(state, paramAutomationName);

  const createAutomation = useCallback(async (): Promise<CreateAutomationResult> => {
    setLoading((prev) => ({ ...prev, save: true }));
    try {
      await contextCreateAutomation();
      return { status: "success" };
    } catch (error: unknown) {
      const description = (error as { description?: string })?.description;
      return { status: "error", description };
    } finally {
      setLoading((prev) => ({ ...prev, save: false }));
    }
  }, [contextCreateAutomation]);

  const updateAutomation = useCallback(async (): Promise<UpdateAutomationResult> => {
    setLoading((prev) => ({ ...prev, save: true }));
    try {
      await contextUpdateAutomation();
      return { status: "success" };
    } catch (error: unknown) {
      const description = (error as { description?: string })?.description;
      return { status: "error", description };
    } finally {
      setLoading((prev) => ({ ...prev, save: false }));
    }
  }, [contextUpdateAutomation]);

  const deleteAutomation = useCallback(async (): Promise<DeleteAutomationResult> => {
    setLoading((prev) => ({ ...prev, delete: true }));
    try {
      await contextDeleteAutomation();
      return { status: "success" };
    } catch (error: unknown) {
      const description = (error as { description?: string })?.description;
      return { status: "error", description };
    } finally {
      setLoading((prev) => ({ ...prev, delete: false }));
    }
  }, [contextDeleteAutomation]);

  return {
    state,
    setAutomationName,
    setRetrigger,
    loading,
    isValidAutomation,
    hasUnsavedChanges,
    eventInfo,
    eventDevice,
    actionCards,
    createAutomation,
    updateAutomation,
    deleteAutomation,
  };
}
