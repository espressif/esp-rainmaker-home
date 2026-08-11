/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useCDF } from "@shared/hooks/useCDF";

const SCAN_QR_ROUTE = "/(provision)/ScanQR";
const ADD_DEVICE_SELECTION_ROUTE = "/(provision)/AddDeviceSelection";

/**
 * Opens the add-device flow; secondary users get the restriction screen.
 * @returns Press handler.
 */
export const useAddDeviceNavigation = (): (() => void) => {
  const router = useRouter();
  const { store } = useCDF();

  return useCallback(() => {
    const isPrimary = store.getCurrentHome()?.isPrimaryUser ?? false;
    router.push({
      pathname: isPrimary ? SCAN_QR_ROUTE : ADD_DEVICE_SELECTION_ROUTE,
    } as Parameters<typeof router.push>[0]);
  }, [router, store]);
};
