/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from "react";
import { usePreventRemove } from "@react-navigation/native";

export interface UseUnsavedChangesGuardParams {
  /** Whether the screen currently holds edits the user could lose. */
  hasUnsavedChanges: boolean;
  /**
   * Navigates away from the screen. Runs one render after the guard is
   * released, so the removal is never blocked. Must be referentially stable
   * (useCallback), as it is an effect dependency.
   */
  onExit: () => void;
}

export interface UseUnsavedChangesGuardResult {
  /** Whether the discard-confirmation dialog should be visible. */
  isDiscardDialogOpen: boolean;
  /** Exits without warning (call after a successful save/delete). */
  exit: () => void;
  /** Exits if clean, otherwise opens the discard dialog (header back). */
  requestExit: () => void;
  /** Dialog confirm: closes the dialog and exits, discarding edits. */
  confirmDiscard: () => void;
  /** Dialog cancel: closes the dialog and stays on the screen. */
  cancelDiscard: () => void;
}

/**
 * Warns before a screen with unsaved edits is left, covering every removal
 * path: the header back button (wire `requestExit`), the Android hardware
 * back button, and the iOS swipe-back gesture (both via `usePreventRemove`).
 *
 * Render the discard dialog (e.g. `UnsavedChangesDialog`) from
 * `isDiscardDialogOpen`/`confirmDiscard`/`cancelDiscard`. Intentional exits —
 * successful save/update/delete — call `exit()`, which releases the guard one
 * render before `onExit` navigates.
 *
 * Keep draft state intact until the screen unmounts (reset in an unmount
 * cleanup, not in `onExit`), so the form does not blank out while the
 * dismiss transition is still showing it.
 */
export function useUnsavedChangesGuard({
  hasUnsavedChanges,
  onExit,
}: UseUnsavedChangesGuardParams): UseUnsavedChangesGuardResult {
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  usePreventRemove(hasUnsavedChanges && !isExiting, () => {
    setIsDiscardDialogOpen(true);
  });

  const exit = useCallback(() => setIsExiting(true), []);

  useEffect(() => {
    if (!isExiting) return;
    onExit();
  }, [isExiting, onExit]);

  const requestExit = useCallback(() => {
    if (hasUnsavedChanges) {
      setIsDiscardDialogOpen(true);
      return;
    }
    exit();
  }, [hasUnsavedChanges, exit]);

  const confirmDiscard = useCallback(() => {
    setIsDiscardDialogOpen(false);
    exit();
  }, [exit]);

  const cancelDiscard = useCallback(() => setIsDiscardDialogOpen(false), []);

  return {
    isDiscardDialogOpen,
    exit,
    requestExit,
    confirmDiscard,
    cancelDiscard,
  };
}

/**
 * Content-based unsaved-changes detection: captures `serializedDraft` as the
 * baseline the first time `isReady` is true, then reports whether the draft
 * has drifted from it.
 *
 * Serialize the draft with `stableStringify` so deeply-equal objects compare
 * equal regardless of key insertion order. Flip `isReady` in the same effect
 * batch as the dispatches that initialize the draft (param sync, edit-mode
 * load), so the baseline never captures a half-initialized state. While
 * `isReady` is false this always returns false — nothing to lose yet.
 */
export function useDraftBaseline(
  serializedDraft: string,
  isReady: boolean
): boolean {
  const [baseline, setBaseline] = useState<string | null>(null);

  useEffect(() => {
    if (isReady && baseline === null) {
      setBaseline(serializedDraft);
    }
  }, [isReady, baseline, serializedDraft]);

  return baseline !== null && serializedDraft !== baseline;
}
