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

export interface SyncHomeWithNodesOptions {
  /** Fetch even when the tree is already synced (pull-to-refresh, login, changes the store cannot apply itself). */
  force?: boolean;
}

export type SyncHomeWithNodes = (
  options?: SyncHomeWithNodesOptions,
) => Promise<void>;

/** Only one custom-data fetch at a time; concurrent callers await the same run */
let userCustomDataPromise: Promise<void> | null = null;

interface StoreContextType {
  store: ESPCDF;
  espCDFUser: ESPCDFUser | null;
  setESPCDFUser: (user: ESPCDFUser | null) => void;
  isInitialized: boolean;
  syncHomeWithNodes: SyncHomeWithNodes;
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
   * Fetch the user's custom data into the store (`user.customData`).
   * Concurrent callers share the same in-flight request.
   */
  const initUserCustomData = async (): Promise<void> => {
    if (userCustomDataPromise) return userCustomDataPromise;
    const user = cdfInstanceRef.current?.userStore.user;
    if (!user) return;
    userCustomDataPromise = (async () => {
      try {
        await user.getCustomData();
      } finally {
        userCustomDataPromise = null;
      }
    })();
    return userCustomDataPromise;
  };

  /**
   * Sync homes and nodes via user.syncHomeWithNodes.
   * The CDF decides: once a sync has completed, a non-forced call returns the
   * store (no network) until `force` asks for a new sync; concurrent callers
   * share one in-flight run.
   */
  const syncHomeWithNodes: SyncHomeWithNodes = async ({ force = false } = {}) => {
    const user = cdfInstanceRef.current?.userStore.user;
    if (!user) {
      console.error("[CDF] Unified CDF instance or user not available");
      return;
    }
    // The sync picks the home from `lastSelectedHomeId` in custom data and
    // persists its choice. Load custom data first so a sync that starts
    // before the post-login fetch cannot fall back to the first home and
    // overwrite the user's saved selection with it.
    if (user.customData === undefined) {
      await initUserCustomData().catch((error) => {
        console.warn("[CDF] custom data fetch before sync failed:", error);
      });
    }
    await user.syncHomeWithNodes({ force });
    // Subscribe to node updates after a delay to ensure the nodes are fetched
    setTimeout(async () => {
      await user.subscribeToNodeUpdates?.({
        nodeList: cdfInstanceRef.current?.nodeStore.nodesList!,
      });
    }, 5000);
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
