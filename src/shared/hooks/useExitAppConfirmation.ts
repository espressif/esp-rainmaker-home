/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";

export interface UseExitAppConfirmationReturn {
  /** Whether the "exit app?" dialog is showing. */
  isExitDialogOpen: boolean;
  /** Close the app. Wire to the dialog's confirm action. */
  confirmExit: () => void;
  /** Dismiss the dialog and stay in the app. Wire to cancel / backdrop. */
  cancelExit: () => void;
}

/**
 * How long the confirmation Modal's `animationType="fade"` takes to leave the
 * screen. RN's fade runs ~150 ms; doubled for dispatch latency to the native
 * dialog, so the activity is only finished once the popup is visibly gone.
 */
const DIALOG_DISMISS_ANIMATION_MS = 300;

/**
 * Resolves once the just-closed dialog has actually disappeared from screen:
 * one frame for React to commit `visible={false}` and hand it to the native
 * Modal, then the fade-out duration. Android's RN Modal offers no
 * dismissal-complete callback, so this timed wait is the reliable signal.
 */
function waitForDialogDismissal(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, DIALOG_DISMISS_ANIMATION_MS);
    });
  });
}

/**
 * Guards the Android hardware back button on a root screen, so a stray press
 * asks before closing the app instead of dropping the user to the launcher.
 *
 * Only active while the calling screen is focused, and inherently Android-only
 * — `hardwareBackPress` never fires on iOS, which has no back button and whose
 * App Store guidelines forbid programmatic exit.
 *
 * A second back press while the dialog is open dismisses it rather than
 * exiting, matching the setup-flow guard in the provision screens.
 */
export function useExitAppConfirmation(): UseExitAppConfirmationReturn {
  const [isExitDialogOpen, setIsExitDialogOpen] = useState(false);

  // Mirrored in a ref so the listener — registered once per focus — reads the
  // current value instead of the one captured when it was registered.
  const isExitDialogOpenRef = useRef(false);
  isExitDialogOpenRef.current = isExitDialogOpen;

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        setIsExitDialogOpen(!isExitDialogOpenRef.current);
        // Always consume the press: neither opening nor dismissing the dialog
        // should also pop the route or close the app.
        return true;
      };
      const sub = BackHandler.addEventListener(
        "hardwareBackPress",
        onHardwareBack,
      );
      return () => sub.remove();
    }, []),
  );

  // `exitApp` finishes the Android activity but leaves the JS runtime alive, so
  // React state outlives the "exit" and the next launch resumes it. Worse, the
  // OS snapshots the activity as it stops and replays that bitmap as the
  // starting window on relaunch — if the dialog is still fading out when the
  // activity finishes, the snapshot has the popup baked in and the next launch
  // shows it until the first real frame draws. Two guards:

  // 1. Sequence the exit behind the dialog's actual dismissal: commit the
  //    close, wait for the native Modal's fade-out to finish on screen, then
  //    finish the activity. RN's Modal has no dismissal-complete callback on
  //    Android, so the wait is a frame (close committed and dispatched) plus
  //    the fade duration with margin.
  const confirmExit = useCallback(() => {
    setIsExitDialogOpen(false);
    void (async () => {
      await waitForDialogDismissal();
      BackHandler.exitApp();
    })();
  }, []);

  const cancelExit = useCallback(() => setIsExitDialogOpen(false), []);

  // 2. Close it on every return to the foreground. Navigation focus does not
  //    change when the app is backgrounded, so `useFocusEffect` never fires on
  //    relaunch — AppState is the only signal that the user is back.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setIsExitDialogOpen(false);
      }
    });
    return () => sub.remove();
  }, []);

  return { isExitDialogOpen, confirmExit, cancelExit };
}
