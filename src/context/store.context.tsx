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

import { cdfBootstrap } from "@integrations";
import { ESPCDF, ESPCDFUser } from "@store";

/** Only one sync at a time; concurrent callers await the same run */
let syncHomeWithNodesPromise: Promise<void> | null = null;

interface StoreContextType {
  store: ESPCDF;
  espCDFUser: ESPCDFUser | null;
  setESPCDFUser: (user: ESPCDFUser | null) => void;
  isInitialized: boolean;
  syncHomeWithNodes: (shouldFetchFirstPage?: boolean) => Promise<void>;
  initUserCustomData: () => Promise<void>;
  getActiveAdaptorIdentifier: () => string | null;
}

interface StoreProviderProps {
  children: ReactNode;
}

export const StoreContext = createContext<StoreContextType | undefined>(
  undefined,
);

/**
 * Bootstraps the unified CDF store, restores session when possible, and exposes sync/home helpers to the tree.
 */
export const StoreProvider: React.FC<StoreProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [espCDFUser, setESPCDFUser] = useState<ESPCDFUser | null>(null);
  // AppInitGate already awaits cdfBootstrap.initialize() before this mounts.
  // Seed synchronously so the first render (e.g. restored Home after Android
  // notification reopen) does not expose store: null to group screens.
  const cdfInstanceRef = useRef<ESPCDF | null>(cdfBootstrap.getCDFInstance());

  const initApp = async () => {
    try {
      cdfInstanceRef.current = await cdfBootstrap.initialize();
      // Try to restore ESPCDFUser from unified CDF store (auto-login)
      // Uses the active adaptor set in the registry (no need to pass adaptorIdentifier)
      if (cdfInstanceRef.current) {
        try {
          const user = await cdfInstanceRef.current.userStore.restoreSession();
          setESPCDFUser(user ?? null);
        } catch (error) {
          // User is not logged in, which is expected on first launch
          console.error(
            "[CDF] No logged in user found in unified CDF store:",
            error,
          );
        }
      }
      setIsInitialized(true);
    } catch (error) {
      console.error("Failed to initialize CDF:", error);
      setIsInitialized(true);
    }
  };

  /**
   * Sync homes and nodes via user.syncHomeWithNodes.
   * Used on login and on manual refresh. Replaces legacy fetchUnifiedGroups (groupStore.syncGroupsList + pagination).
   * Concurrent callers share the same in-flight request.
   */
  const syncHomeWithNodes = async (
    _shouldFetchFirstPage: boolean = true,
  ): Promise<void> => {
    if (syncHomeWithNodesPromise) return syncHomeWithNodesPromise;
    if (!cdfInstanceRef.current) {
      console.error("[CDF] Unified CDF instance not available");
      return;
    }

    syncHomeWithNodesPromise = (async () => {
      try {
        const user = cdfInstanceRef.current?.userStore.user;
        await user?.syncHomeWithNodes?.();
        // Subscribe to node updates after a delay to ensure the nodes are fetched
        setTimeout(async () => {
          await user?.subscribeToNodeUpdates?.({
            nodeList: cdfInstanceRef.current?.nodeStore.nodesList!,
          });
        }, 5000);
      } finally {
        syncHomeWithNodesPromise = null;
      }
    })();
    return syncHomeWithNodesPromise;
  };

  const initUserCustomData = async () => {
    const user = cdfInstanceRef.current?.userStore.user;
    if (user) {
      await user.getCustomData();
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  return (
    <StoreContext.Provider
      value={{
        store: cdfInstanceRef.current!,
        isInitialized,
        espCDFUser,
        setESPCDFUser,
        syncHomeWithNodes,
        initUserCustomData,
        getActiveAdaptorIdentifier: () =>
          cdfInstanceRef.current?.getActiveAdaptorIdentifier() ?? null,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};
