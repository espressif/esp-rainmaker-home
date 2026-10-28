/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFUser, GroupStoreCallbacks } from "@store";
import { endUserSession } from "@shared/utils/userSession";
import { syncHomeWithNodes } from "../groupSync";

jest.mock("@store", () => ({
  ESPCDF: { instance: { groupStore: { currentHomeId: null } } },
  getValidHomes: (groups: unknown[]) => groups,
  ensureHomesAreMutuallyExclusive: async () => {},
  findHomeGroup: (homes: { id: string }[], options: { preferredId?: string }) =>
    homes.find((home) => home.id === options.preferredId) ?? homes[0] ?? null,
  categorizeGroupsByOwnership: (homes: unknown[]) => ({ primaryGroups: homes }),
  GROUP_TYPE_HOME: "home",
  ensureDefaultHomeForNewOrMigratedUser: jest.fn(),
}));
jest.mock("../transformers/transformToESPCDFNode", () => ({
  transformToESPCDFNodes: (nodes: unknown[]) => nodes,
}));

/** Six homes; the user's saved choice is "Beach House". */
const homes = ["Home", "Cabin", "Studio", "Beach House", "Loft", "Barn"].map(
  (id) => ({ id, _raw: { getNodesWithDetails: async () => [] } }),
);

function setup(getCustomData: () => Promise<unknown>) {
  // After an offline start the profile (custom data) was never loaded.
  const user = {
    customData: undefined,
    getCustomData: jest.fn(getCustomData),
    setCustomData: jest.fn(async () => {}),
    getGroups: async () => ({ data: homes }),
  };
  const callbacks = {
    setGroupsList: jest.fn(),
    setCurrentHomeId: jest.fn(),
    addNodesToGroup: jest.fn(),
  };
  const sync = () =>
    syncHomeWithNodes(
      user as unknown as ESPCDFUser,
      callbacks as unknown as GroupStoreCallbacks,
    );
  return { user, callbacks, sync };
}

describe("classic home choice after an offline start", () => {
  beforeEach(async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await endUserSession();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the saved home, not the first one, and does not overwrite it", async () => {
    const { user, callbacks, sync } = setup(async () => ({
      lastSelectedHomeId: { value: "Beach House" },
    }));

    await sync();

    expect(callbacks.setCurrentHomeId).toHaveBeenCalledWith("Beach House");
    expect(user.setCustomData).not.toHaveBeenCalled();
  });

  it("when the saved home cannot be read, shows the first home without saving it", async () => {
    const { user, callbacks, sync } = setup(async () => {
      throw new Error("Network request failed");
    });

    await sync();

    expect(callbacks.setCurrentHomeId).toHaveBeenCalledWith("Home");
    expect(user.setCustomData).not.toHaveBeenCalled();
  });

  it("puts in the home list only once the saved home is known", async () => {
    let answer: (data: unknown) => void = () => {};
    const { callbacks, sync } = setup(
      () => new Promise((resolve) => (answer = resolve)),
    );

    const syncing = sync();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Home must not see homes with no current one while the choice is read.
    expect(callbacks.setGroupsList).not.toHaveBeenCalled();

    answer({ lastSelectedHomeId: { value: "Beach House" } });
    await syncing;

    expect(callbacks.setGroupsList).toHaveBeenCalledTimes(1);
    expect(callbacks.setGroupsList.mock.invocationCallOrder[0]).toBeLessThan(
      callbacks.setCurrentHomeId.mock.invocationCallOrder[0],
    );
  });
});
