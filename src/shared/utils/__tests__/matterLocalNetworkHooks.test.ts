/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFUser } from "@store";
import {
  readHybridSetupFromDevice,
  reportMatterReachability,
  registerMatterLocalNetworkHooks,
} from "../matterLocalNetworkHooks";

jest.mock("@store", () => ({}));

const makeUser = () => ({}) as ESPCDFUser;

describe("matterLocalNetworkHooks", () => {
  it("does nothing for an SDK that registered no hooks (classic)", async () => {
    const user = makeUser();

    await expect(
      reportMatterReachability(user, "0000000000000a06", {}, "add"),
    ).resolves.toBe(false);
    await expect(
      readHybridSetupFromDevice(user, "0000000000000a06"),
    ).resolves.toBeNull();
    await expect(
      reportMatterReachability(null, "0000000000000a06", {}, "add"),
    ).resolves.toBe(false);
  });

  it("calls only the hooks registered for that user", async () => {
    const neoUser = makeUser();
    const otherUser = makeUser();
    const updateReachability = jest.fn().mockResolvedValue(undefined);
    const hydrated = { nodeId: "rmNode", metadata: { endpoints: [] } };
    registerMatterLocalNetworkHooks(neoUser, {
      updateReachability,
      readHybridSetupFromDevice: jest.fn().mockResolvedValue(hydrated),
    });

    await expect(
      reportMatterReachability(
        neoUser,
        "0000000000000a06",
        { host: "10.0.0.5", port: 5540 },
        "add",
      ),
    ).resolves.toBe(true);
    expect(updateReachability).toHaveBeenCalledWith(
      "0000000000000a06",
      { host: "10.0.0.5", port: 5540 },
      "add",
    );
    await expect(
      readHybridSetupFromDevice(neoUser, "0000000000000a06"),
    ).resolves.toBe(hydrated);

    await expect(
      reportMatterReachability(otherUser, "0000000000000a06", {}, "remove"),
    ).resolves.toBe(false);
    expect(updateReachability).toHaveBeenCalledTimes(1);
  });
});
