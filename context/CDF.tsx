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

import { CDF_EXTERNAL_PROPERTIES } from "@/utils/constants";
interface StoreContextType {
  store: CDF;
  isInitialized: boolean;
  fetchAllNodes: (shouldFetchFirstPage?: boolean) => Promise<ESPRMNode[]>;
  fetchAllGroups: (shouldFetchFirstPage?: boolean) => Promise<ESPRMGroup[]>;
  fetchNodesAndGroups: (shouldFetchFirstPage?: boolean) => Promise<{
    nodes: ESPRMNode[];
    groups: ESPRMGroup[];
  }>;
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

  useEffect(() => {
    initApp();
  }, []);

  return (
    <StoreContext.Provider
      value={{
        store: storeRef.current!,
        isInitialized,
        fetchAllNodes,
        fetchAllGroups,
        fetchNodesAndGroups,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};
