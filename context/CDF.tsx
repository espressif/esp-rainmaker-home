/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useEffect,
  ReactNode,
  useState,
  useRef,
} from "react";

import { SDKConfig, CDFConfig } from "@/rainmaker.config";
import { initCDF, CDF } from "@espressif/rainmaker-base-cdf";
import { ESPRMBase, ESPTransportMode } from "@espressif/rainmaker-base-sdk";
import { CDF_EXTERNAL_PROPERTIES } from "@/utils/constants";
interface StoreContextType {
  store: CDF;
  isInitialized: boolean;
}

interface StoreProviderProps {
  children: ReactNode;
}

export const StoreContext = createContext<StoreContextType | undefined>(
  undefined
);

export const StoreProvider: React.FC<StoreProviderProps> = ({ children }) => {
  const storeRef = useRef<CDF | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const initApp = async () => {
    try {
      ESPRMBase.setTransportOrder([
        ESPTransportMode.local,
        ESPTransportMode.cloud,
      ]);
      const store = await initCDF(SDKConfig, CDFConfig);
      store.userStore.addProperty(
        CDF_EXTERNAL_PROPERTIES.IS_OAUTH_LOGIN,
        false
      );
      setIsInitialized(true);
      storeRef.current = store;
    } catch (error) {
      console.error("Failed to initialize CDF:", error);
      setIsInitialized(true);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  return (
    <StoreContext.Provider value={{ store: storeRef.current!, isInitialized }}>
      {children}
    </StoreContext.Provider>
  );
};
