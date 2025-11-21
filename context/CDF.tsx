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
import {
  ESPRMBase,
  ESPRMGroup,
  ESPRMNode,
  ESPTransportMode,
} from "@espressif/rainmaker-base-sdk";

import { ESPRMUser } from "@espressif/rainmaker-matter-sdk";
import { CDF_EXTERNAL_PROPERTIES } from "@/utils/constants";
interface StoreContextType {
  store: CDF;
  esprmUser: ESPRMUser | null;
  setESPRMUser: (user: ESPRMUser | null) => void;
  refreshESPRMUser: () => Promise<void>;
  isInitialized: boolean;
  fetchAllNodes: (shouldFetchFirstPage?: boolean) => Promise<ESPRMNode[]>;
  fetchAllGroups: (shouldFetchFirstPage?: boolean) => Promise<ESPRMGroup[]>;
  fetchNodesAndGroups: (shouldFetchFirstPage?: boolean) => Promise<{
    nodes: ESPRMNode[];
    groups: ESPRMGroup[];
  }>;
  initUserCustomData: () => Promise<void>;
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
  const [esprmUser, setESPRMUser] = useState<ESPRMUser | null>(null);

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
      storeRef.current = store;

      // Try to restore ESPRMUser from stored tokens (for Matter SDK)
      try {
        const authInstance = ESPRMBase.getAuthInstance();
        const esprmUser = await authInstance.getLoggedInUser();
        if (esprmUser) {
          setESPRMUser(esprmUser);
        }
      } catch (error) {
        console.warn("Failed to restore ESPRMUser:", error);
      }

      setIsInitialized(true);
    } catch (error) {
      console.error("Failed to initialize CDF:", error);
      setIsInitialized(true);
    }
  };

  const fetchAllNodes = async (
    shouldFetchFirstPage: boolean = true
  ): Promise<ESPRMNode[]> => {
    const store = storeRef.current;

    if (!store?.nodeStore) {
      console.warn("Store or nodeStore not available");
      return [];
    }

    try {
      if (shouldFetchFirstPage) await store.nodeStore.syncNodeList();
      setTimeout(async () => {
        while (store.nodeStore.hasNext) {
          await store.nodeStore.fetchNext();
        }
      }, 10);

      return store.nodeStore.nodeList || [];
    } catch (error) {
      console.error("Error fetching nodes:", error);
      throw error;
    }
  };

  const fetchAllGroups = async (
    shouldFetchFirstPage: boolean = true
  ): Promise<ESPRMGroup[]> => {
    const store = storeRef.current;

    if (!store?.groupStore) {
      console.warn("Store or groupStore not available");
      return [];
    }
    try {
      if (shouldFetchFirstPage) await store.groupStore.syncGroupList();
      setTimeout(async () => {
        while (store.groupStore.hasNext) {
          await store.groupStore.fetchNext();
        }
      }, 10);

      return store.groupStore.groupList || [];
    } catch (error) {
      console.error("Error fetching groups:", error);
      throw error;
    }
  };

  const fetchNodesAndGroups = async (
    shouldFetchFirstPage: boolean = true
  ): Promise<{
    nodes: ESPRMNode[];
    groups: ESPRMGroup[];
  }> => {
    try {
      const [nodes, groups] = await Promise.all([
        fetchAllNodes(shouldFetchFirstPage),
        fetchAllGroups(shouldFetchFirstPage),
      ]);

      return { nodes, groups };
    } catch (error) {
      console.error("Error fetching nodes and groups:", error);
      return { nodes: [], groups: [] };
    }
  };

  const initUserCustomData = async () => {
    const store = storeRef.current;

    if (!store) {
      console.warn("Custom data not initialized");
      return;
    }

    const customData = await store.userStore.user?.getCustomData();
    if (customData && store.userStore.userInfo) {
      store.userStore.userInfo.customData = customData;
    }
  };

  /**
   * Manually refresh ESPRMUser from stored tokens
   * Useful after login to immediately set the user for Matter SDK
   */
  const refreshESPRMUser = async () => {
    try {
      const authInstance = ESPRMBase.getAuthInstance();
      const esprmUser = await authInstance.getLoggedInUser();
      if (esprmUser) {
        setESPRMUser(esprmUser);
      }
    } catch (error) {
      console.warn("Failed to refresh ESPRMUser:", error);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  return (
    <StoreContext.Provider
      value={{
        store: storeRef.current!,
        isInitialized,
        esprmUser,
        setESPRMUser,
        refreshESPRMUser,
        fetchAllNodes,
        fetchAllGroups,
        fetchNodesAndGroups,
        initUserCustomData,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};
