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
import type { ESPCDF, ESPCDFUser, GroupStoreCallbacks } from "@store";
import {
  getSessionId,
  isSessionActive,
  onSessionEnd,
} from "@shared/utils/userSession";
import { withTimeout } from "@shared/utils/asyncTimeout";
import { subscribeNodesToUpdates } from "@shared/utils/nodeUpdateSubscription";
import {
  announceHomeSyncSucceeded,
  getHomeSyncGiveUpCount,
  giveUpRunningHomeSyncs,
  isHomeSyncGivenUp,
  throwIfHomeSyncGivenUp,
} from "@shared/utils/homeSyncTracker";

/**
 * Longest a caller waits for the home sync. After it the caller gets a
 * failure (Home shows its notice and retries), but the sync keeps running and
 * keeps the slot, so the next caller joins it instead of starting another.
 */
const HOME_SYNC_CALLER_TIMEOUT_MS = 30_000;

/**
 * Longest one home sync may hold the slot (fetch has no time limit, so a
 * request can hang). After it the store gives up on that sync: the next call
 * starts a fresh one and the old one's late writes are skipped.
 */
const HOME_SYNC_GIVE_UP_MS = 180_000;

export interface SyncHomeWithNodesOptions {
  /** Fetch even when the tree is already synced (pull-to-refresh, login, changes the store cannot apply itself). */
  force?: boolean;
}

export type SyncHomeWithNodes = (
  options?: SyncHomeWithNodesOptions,
) => Promise<void>;

/** Only one sync at a time; concurrent callers await the same run */
let syncHomeWithNodesPromise: Promise<void> | null = null;

/** Only one custom-data fetch at a time; concurrent callers await the same run */
let userCustomDataPromise: Promise<void> | null = null;

// The next login must start its own sync, not wait on the old session's one.
onSessionEnd(() => {
  syncHomeWithNodesPromise = null;
  giveUpRunningHomeSyncs();
});

/**
 * Wraps the store writes a home sync makes so each one first checks that the
 * store has not given up on the sync. A given-up sync then stops at its next
 * write, before it can overwrite newer data or create a second default home.
 * @param callbacks - The user's store writes.
 * @param giveUpCountAtStart - Give-up count when the sync started.
 * @returns Store writes that stop a given-up sync.
 */
function writesForHomeSync(
  callbacks: GroupStoreCallbacks,
  giveUpCountAtStart: number,
): GroupStoreCallbacks {
  // Runs the write only while the store still wants this sync; else throws.
  const stopIfSyncGivenUp =
    <Args extends unknown[]>(write: (...args: Args) => void) =>
    (...args: Args) => {
      throwIfHomeSyncGivenUp(giveUpCountAtStart, "syncHomeWithNodes");
      write(...args);
    };
  return {
    ...callbacks,
    setGroupsList: stopIfSyncGivenUp(callbacks.setGroupsList),
    setCurrentHomeId: stopIfSyncGivenUp(callbacks.setCurrentHomeId),
    addGroup: stopIfSyncGivenUp(callbacks.addGroup),
    addNodesToGroup: stopIfSyncGivenUp(callbacks.addNodesToGroup),
  };
}

/**
 * Runs the user's home sync with store writes that stop once the store gives
 * up on it. Same as `user.syncHomeWithNodes({ force: true })`, which only
 * forwards its own store writes to the adaptor, then marks the tree synced
 * and saves it to disk.
 * @param user - Signed-in CDF user.
 * @param giveUpCountAtStart - Give-up count when the sync started.
 */
async function runUserHomeSync(
  user: ESPCDFUser,
  giveUpCountAtStart: number,
): Promise<void> {
  const callbacks = user.__storeCallbacks;
  if (!callbacks || !user.operations.syncHomeWithNodes) {
    return;
  }
  await user.operations.syncHomeWithNodes(
    user,
    writesForHomeSync(callbacks, giveUpCountAtStart),
  );
  // A given-up sync's tree may be stale: do not mark or save it.
  if (isHomeSyncGivenUp(giveUpCountAtStart)) return;
  callbacks.markTreeSynced?.();
  callbacks.persistSnapshot?.();
}

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
   * Once a sync has completed, a non-forced call returns the store (no
   * network) until `force` asks for a new sync. Concurrent callers share the
   * same in-flight request; each waits for it at most
   * {@link HOME_SYNC_CALLER_TIMEOUT_MS}.
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
    if (!syncHomeWithNodesPromise) {
      if (!force && user.__storeCallbacks?.isTreeSynced?.()) {
        subscribeToNodeUpdatesLater(user, getSessionId());
        return;
      }
      syncHomeWithNodesPromise = startHomeSync();
    }
    return withTimeout(
      syncHomeWithNodesPromise,
      HOME_SYNC_CALLER_TIMEOUT_MS,
      `Home sync gave no answer within ${HOME_SYNC_CALLER_TIMEOUT_MS / 1000} s`,
    );
  };

  /**
   * Subscribes to node updates after a delay to ensure the nodes are fetched.
   * Skipped after logout: it would open device links nobody closes.
   * @param user - Signed-in CDF user.
   * @param sessionId - Session the sync ran in.
   */
  const subscribeToNodeUpdatesLater = (
    user: ESPCDFUser,
    sessionId: number,
  ): void => {
    setTimeout(async () => {
      if (!isSessionActive(sessionId)) return;
      await subscribeNodesToUpdates(
        user,
        cdfInstanceRef.current?.nodeStore.nodesList!,
      );
    }, 5000);
  };

  /**
   * Starts one home sync. It holds the slot until it ends, or until the store
   * gives up on it after {@link HOME_SYNC_GIVE_UP_MS}.
   * @returns The sync's promise.
   */
  const startHomeSync = (): Promise<void> => {
    const sessionId = getSessionId();
    const giveUpCountAtStart = getHomeSyncGiveUpCount();
    let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = (async () => {
      const user = cdfInstanceRef.current?.userStore.user;
      if (!user) return;
      await runUserHomeSync(user, giveUpCountAtStart);
      if (isHomeSyncGivenUp(giveUpCountAtStart)) return;
      announceHomeSyncSucceeded();
      subscribeToNodeUpdatesLater(user, sessionId);
    })().finally(() => {
      clearTimeout(giveUpTimer);
      // A newer session's sync may have taken the slot meanwhile.
      if (syncHomeWithNodesPromise === sync) syncHomeWithNodesPromise = null;
    });
    giveUpTimer = setTimeout(() => {
      if (syncHomeWithNodesPromise !== sync) return;
      console.warn(
        `[CDF] Home sync still running after ${HOME_SYNC_GIVE_UP_MS / 1000} s; starting fresh syncs and skipping its late writes`,
      );
      giveUpRunningHomeSyncs();
      syncHomeWithNodesPromise = null;
    }, HOME_SYNC_GIVE_UP_MS);
    return sync;
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
