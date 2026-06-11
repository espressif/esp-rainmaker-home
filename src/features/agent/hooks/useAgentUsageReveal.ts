/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { getCurrentUsage } from "@features/agent/utils/apiHelper";
import type { UsageQuota } from "@features/agent/utils/types";

/**
 * Manages double-tap toggle of the agent usage strip inside the chat container.
 * @returns Visibility state, usage data, double-tap gesture, and hide callback.
 */
export function useAgentUsageReveal() {
  const [isVisible, setIsVisible] = useState(false);
  const [usage, setUsage] = useState<UsageQuota | null>(null);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  /**
   * Fetches current usage from the agents API and shows the strip.
   */
  const fetchAndReveal = useCallback(async () => {
    try {
      const quota = await getCurrentUsage();
      setUsage(quota);
      setIsVisible(true);
    } catch {
      setIsVisible(false);
      setUsage(null);
    }
  }, []);

  /**
   * Hides the usage strip, e.g. after the user sends a new message.
   */
  const hideUsageStrip = useCallback(() => {
    setIsVisible(false);
    setUsage(null);
  }, []);

  /**
   * Toggles the usage strip: hides when open, fetches and shows when closed.
   */
  const toggleUsageStrip = useCallback(() => {
    if (isVisibleRef.current) {
      setIsVisible(false);
      setUsage(null);
      return;
    }

    void fetchAndReveal();
  }, [fetchAndReveal]);

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          runOnJS(toggleUsageStrip)();
        }),
    [toggleUsageStrip],
  );

  return {
    isVisible,
    usage,
    hideUsageStrip,
    toggleUsageStrip,
    doubleTapGesture,
  };
}
