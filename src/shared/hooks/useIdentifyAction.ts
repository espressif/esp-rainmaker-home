/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useToast } from "@shared/hooks/useToast";
import { DEVICE_IDENTIFY_SECONDS } from "@shared/utils/deviceIdentify";

export interface UseIdentifyActionResult {
  /** True for as long as the device is visibly identifying itself. */
  isIdentifying: boolean;
  /** Asks the device to identify, then holds `isIdentifying` for the window. */
  identify: () => Promise<void>;
}

/**
 * Holds the busy flag for the identify window, not the write, so it lasts as
 * long as the device is visibly signalling.
 * @param perform - Sends the identify write; resolves true when accepted
 * @returns Busy flag and the trigger to render against
 */
export const useIdentifyAction = (
  perform: () => Promise<boolean>,
): UseIdentifyActionResult => {
  const { t } = useTranslation();
  const toast = useToast();
  const [isIdentifying, setIsIdentifying] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    },
    [],
  );

  const identify = useCallback(async () => {
    if (isIdentifying) {
      return;
    }
    setIsIdentifying(true);
    const accepted = await perform();
    if (!accepted) {
      setIsIdentifying(false);
      toast.showError(t("device.identify.failed"));
      return;
    }
    // The icon carries no label, so the toast says what to expect.
    toast.showSuccess(
      t("device.identify.hint", { count: DEVICE_IDENTIFY_SECONDS }),
    );
    holdTimerRef.current = setTimeout(
      () => setIsIdentifying(false),
      DEVICE_IDENTIFY_SECONDS * 1000,
    );
  }, [isIdentifying, perform, t, toast]);

  return { isIdentifying, identify };
};
