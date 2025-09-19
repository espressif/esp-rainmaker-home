/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext } from "react";
import { StoreContext } from "@/context/CDF";

/**
 * Hook to access the CDF store from any component
 * @returns The CDF store and initialization status
 */
export const useCDF = () => {
  const context = useContext(StoreContext);

  if (!context) {
    throw new Error("useCDF must be used within a StoreProvider");
  }

  return context;
};
