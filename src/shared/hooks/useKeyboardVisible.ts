/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { Keyboard } from "react-native";
import {
  KEYBOARD_DID_HIDE,
  KEYBOARD_DID_SHOW,
} from "@shared/utils/constants";

/**
 * Tracks whether the soft keyboard is currently visible.
 * Used to hide bottom chrome (save/delete footers, version text) so it does
 * not ride up over inputs when Android resizes the window for the keyboard.
 * @returns `true` while the keyboard is open, otherwise `false`.
 */
export function useKeyboardVisible(): boolean {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(KEYBOARD_DID_SHOW, () => {
      setIsKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(KEYBOARD_DID_HIDE, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return isKeyboardVisible;
}
