/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFUser, GroupStoreCallbacks } from "@store";
import type { ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import { endUserSession, SessionEndedError } from "@shared/utils/userSession";
import {
  giveUpRunningHomeSyncs,
  HomeSyncGivenUpError,
} from "@shared/utils/homeSyncTracker";
import { syncHomeWithNodes } from "../groupSync";

jest.mock("@store", () => ({
  DEFAULT_HOME_GROUP_NAME: "Home",
  ESPCDF: { instance: null },
}));
jest.mock("@shared/utils/constants", () => ({ USER_PERMISSION: "user" }));
jest.mock("../utils/constants", () => ({
  ESPRMNEO_CUSTOM_DATA_KEY_LAST_SELECTED_HOME_ID: "lastSelectedHomeId",
}));
jest.mock("../utils/logger", () => ({
  Logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../utils/helpers/mqttConnectionHelpers", () => ({
  ensureRmneoMqttConnected: jest.fn(async () => {}),
}));
jest.mock("../utils/helpers/groupHelpers", () => ({
  buildNodeSubgroupMembershipMap: () => new Map(),
  diffChangedSubgroupMembershipNodeIds: () => [],
  resyncMqttAfterSubgroupChange: jest.fn(async () => {}),
  transformRmneoSdkGroupsToCdf: (_user: unknown, groups: unknown[]) => groups,
  defaultGroupTransform: (group: unknown) => group,
}));

/** A promise the test settles by hand, to log out while the sync waits. */
function later<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const node = { id: "light" };

function setup(
  getNodes: () => Promise<unknown[]>,
  mqttConnection: Promise<unknown> = Promise.resolve(),
) {
  const home = { id: "homeA", nodeIds: ["light"], getNodes };
  const groups = later<unknown[]>();
  const user = {
    customData: {},
    setCustomData: jest.fn(async () => {}),
    subscribeToNodeUpdates: jest.fn(async () => {}),
  };
  const callbacks = {
    setGroupsList: jest.fn(),
    setCurrentHomeId: jest.fn(),
    addNodesToGroup: jest.fn(),
  };
  const sync = syncHomeWithNodes(
    user as unknown as ESPCDFUser,
    callbacks as unknown as GroupStoreCallbacks,
    { getGroups: () => groups.promise } as unknown as ESPRMNeoUser,
    mqttConnection,
  );
  return { sync, groups, home, user, callbacks };
}

describe("syncHomeWithNodes", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads homes and devices for the signed-in user", async () => {
    const { sync, groups, home, user, callbacks } = setup(async () => [node]);
    groups.resolve([home]);

    await expect(sync).resolves.toBe(home);
    expect(callbacks.setGroupsList).toHaveBeenCalledWith([home]);
    expect(callbacks.addNodesToGroup).toHaveBeenCalledWith("homeA", [node]);
    expect(user.subscribeToNodeUpdates).toHaveBeenCalledTimes(1);
  });

  it("loads the home without waiting for an MQTT connect that never answers", async () => {
    jest.useFakeTimers();
    const { sync, groups, home, callbacks } = setup(
      async () => [node],
      new Promise(() => {}),
    );
    groups.resolve([home]);

    await jest.advanceTimersByTimeAsync(4000);
    await expect(sync).resolves.toBe(home);
    expect(callbacks.addNodesToGroup).toHaveBeenCalledWith("homeA", [node]);
  });

  it("writes nothing when the user logs out while homes are loading", async () => {
    const { sync, groups, home, user, callbacks } = setup(async () => [node]);

    await endUserSession();
    groups.resolve([home]);

    await expect(sync).rejects.toBeInstanceOf(SessionEndedError);
    expect(callbacks.setGroupsList).not.toHaveBeenCalled();
    expect(callbacks.setCurrentHomeId).not.toHaveBeenCalled();
    expect(user.setCustomData).not.toHaveBeenCalled();
    expect(user.subscribeToNodeUpdates).not.toHaveBeenCalled();
  });

  it("drops devices that arrive after logout", async () => {
    const nodes = later<unknown[]>();
    const { sync, groups, home, user, callbacks } = setup(() => nodes.promise);
    groups.resolve([home]);
    await new Promise((done) => setImmediate(done));

    await endUserSession();
    nodes.resolve([node]);

    await expect(sync).rejects.toBeInstanceOf(SessionEndedError);
    expect(callbacks.addNodesToGroup).not.toHaveBeenCalled();
    expect(user.subscribeToNodeUpdates).not.toHaveBeenCalled();
  });

  it("adds no default home and writes nothing once the store gave up on the sync", async () => {
    const groups = later<unknown[]>();
    const createGroup = jest.fn(async () => ({ id: "default" }));
    const callbacks = {
      setGroupsList: jest.fn(),
      setCurrentHomeId: jest.fn(),
      addNodesToGroup: jest.fn(),
    };
    const sync = syncHomeWithNodes(
      { customData: {}, setCustomData: jest.fn() } as unknown as ESPCDFUser,
      callbacks as unknown as GroupStoreCallbacks,
      {
        getGroups: () => groups.promise,
        createGroup,
      } as unknown as ESPRMNeoUser,
      Promise.resolve(),
    );
    await new Promise((done) => setImmediate(done));

    // The store gave up on this sync (it ran too long); the user has no homes.
    giveUpRunningHomeSyncs();
    groups.resolve([]);

    await expect(sync).rejects.toBeInstanceOf(HomeSyncGivenUpError);
    expect(createGroup).not.toHaveBeenCalled();
    expect(callbacks.setGroupsList).not.toHaveBeenCalled();
  });
});
