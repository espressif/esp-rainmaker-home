/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext } from "react";
import { act, render } from "@testing-library/react-native";
import {
  StoreContext,
  StoreProvider,
  type SyncHomeWithNodes,
} from "@context/store.context";
import { onHomeSyncSucceeded } from "@shared/utils/homeSyncTracker";
import { retryHomeLoadUntilItWorks } from "../retryHomeLoad";

type Home = { id: string };
type Writes = {
  setGroupsList: (homes: Home[]) => void;
  setCurrentHomeId: (id: string | null) => void;
};

/** What the store holds; the real store writes land here. */
let mockStoreHomes: Home[] = [];
let mockCurrentHomeId: string | null = null;
const mockUser = {
  __storeCallbacks: {
    setGroupsList: (homes: Home[]) => {
      mockStoreHomes = homes;
    },
    setCurrentHomeId: (id: string | null) => {
      mockCurrentHomeId = id;
    },
    addGroup: () => {},
    addNodesToGroup: () => {},
  },
  customData: {},
  operations: { syncHomeWithNodes: jest.fn() },
  subscribeToNodeUpdates: jest.fn(async () => {}),
};
const mockCdf = {
  userStore: { user: mockUser, restoreSession: async () => mockUser },
  nodeStore: { nodesList: [] },
  getActiveAdaptorIdentifier: () => null,
};

jest.mock("@integrations", () => ({
  cdfBootstrap: {
    getCDFInstance: () => mockCdf,
    initialize: async () => mockCdf,
  },
}));
jest.mock("@store", () => ({}));
jest.mock("@native-adaptors/utils/internetBack", () => ({
  onInternetBack: () => () => {},
}));

/** Renders the store and hands back its home sync function. */
async function renderStoreSync(): Promise<SyncHomeWithNodes> {
  let sync: SyncHomeWithNodes | undefined;
  const Capture = () => {
    sync = useContext(StoreContext)?.syncHomeWithNodes;
    return null;
  };
  render(
    <StoreProvider>
      <Capture />
    </StoreProvider>,
  );
  await act(async () => {});
  return (options) => sync!(options);
}

/** A sync the test finishes by hand, like a request that answers late. */
function lateSync(work: (writes: Writes) => Promise<void> | void) {
  let finish = () => {};
  const started = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const run = async (_user: unknown, writes: Writes) => {
    await started;
    await work(writes);
  };
  return { run, finish: () => finish() };
}

const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

describe("home sync time limits", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockUser.operations.syncHomeWithNodes.mockReset();
    mockStoreHomes = [];
    mockCurrentHomeId = null;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("answers callers after 30 s but keeps one sync running, which the retry then joins", async () => {
    const first = lateSync((writes) => writes.setGroupsList([{ id: "home" }]));
    mockUser.operations.syncHomeWithNodes.mockImplementationOnce(first.run);
    const sync = await renderStoreSync();
    jest.useFakeTimers();
    const succeeded = jest.fn();
    const stopListening = onHomeSyncSucceeded(succeeded);

    const onLoaded = jest.fn();
    let stopRetry = () => {};
    const firstLoad = sync({ force: true }).catch(() => {
      // What Home does when a load fails.
      stopRetry = retryHomeLoadUntilItWorks(() => sync({ force: true }), onLoaded);
    });

    await advance(30_000);
    await firstLoad;
    // The retry at +5 s joins the sync still running rather than starting one.
    await advance(5_000);
    expect(mockUser.operations.syncHomeWithNodes).toHaveBeenCalledTimes(1);

    first.finish();
    await advance(0);
    expect(mockStoreHomes).toEqual([{ id: "home" }]);
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(succeeded).toHaveBeenCalledTimes(1);
    stopRetry();
    stopListening();
  });

  it("gives up on a sync after 3 min; when it finishes late it neither overwrites nor adds a default home", async () => {
    const createDefaultHome = jest.fn();
    // Like the classic adaptor: lists homes, then creates a default one if none.
    const stale = lateSync(async (writes) => {
      writes.setGroupsList([]);
      await createDefaultHome();
      writes.setCurrentHomeId("default");
    });
    mockUser.operations.syncHomeWithNodes
      .mockImplementationOnce(stale.run)
      .mockImplementationOnce(async (_user: unknown, writes: Writes) => {
        writes.setGroupsList([{ id: "fresh" }]);
        writes.setCurrentHomeId("fresh");
      });
    const sync = await renderStoreSync();
    jest.useFakeTimers();
    const succeeded = jest.fn();
    const stopListening = onHomeSyncSucceeded(succeeded);

    void sync({ force: true }).catch(() => {});
    await advance(179_000);
    // Still the same sync: a call now joins it.
    void sync({ force: true }).catch(() => {});
    expect(mockUser.operations.syncHomeWithNodes).toHaveBeenCalledTimes(1);

    await advance(1_000);
    await act(() => sync({ force: true }));
    expect(mockUser.operations.syncHomeWithNodes).toHaveBeenCalledTimes(2);
    expect(mockStoreHomes).toEqual([{ id: "fresh" }]);

    stale.finish();
    await advance(0);
    expect(mockStoreHomes).toEqual([{ id: "fresh" }]);
    expect(mockCurrentHomeId).toBe("fresh");
    expect(createDefaultHome).not.toHaveBeenCalled();
    // Only the fresh sync counts as one that worked.
    expect(succeeded).toHaveBeenCalledTimes(1);
    stopListening();
  });
});
