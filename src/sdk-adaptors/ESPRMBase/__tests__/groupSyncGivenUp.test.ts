/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFUser, GroupStoreCallbacks } from "@store";
import { HomeSyncGivenUpError } from "@shared/utils/homeSyncTracker";
import { syncHomeWithNodes } from "../groupSync";

jest.mock("@store", () => ({
  ESPCDF: { instance: null },
  getValidHomes: (groups: unknown[]) => groups,
  ensureHomesAreMutuallyExclusive: async () => {},
  findHomeGroup: (homes: unknown[]) => homes[0],
  categorizeGroupsByOwnership: (homes: unknown[]) => ({ primaryGroups: homes }),
  GROUP_TYPE_HOME: "home",
  ensureDefaultHomeForNewOrMigratedUser: jest.fn(),
}));
jest.mock("../transformers/transformToESPCDFNode", () => ({
  transformToESPCDFNodes: (nodes: unknown[]) => nodes,
}));

describe("classic syncHomeWithNodes, given up by the store", () => {
  it("does not report its skipped node writes as errors", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    const home = {
      id: "home",
      _raw: { getNodesWithDetails: async () => [{ id: "light" }] },
    };
    const user = {
      customData: {},
      setCustomData: async () => {},
      getCustomData: async () => ({}),
      getGroups: async () => ({ data: [home] }),
    };
    // What the store's guarded writes do once it gave up on this sync.
    const callbacks = {
      setGroupsList: jest.fn(),
      setCurrentHomeId: jest.fn(),
      addNodesToGroup: () => {
        throw new HomeSyncGivenUpError("syncHomeWithNodes");
      },
    };

    await syncHomeWithNodes(
      user as unknown as ESPCDFUser,
      callbacks as unknown as GroupStoreCallbacks,
    );

    expect(error).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
