/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { endUserSession } from "@shared/utils/userSession";
import { ESPMatterControlAdapter } from "../ESPMatterControlAdapter";
import {
  ESPMatterSubscriptionAdapter,
  registerMatterNodeIdMapping,
} from "../ESPMatterSubscriptionAdapter";

jest.mock("../ESPMatterControlAdapter", () => ({
  ESPMatterControlAdapter: { subscribe: jest.fn(), init: jest.fn() },
}));

const subscribe = ESPMatterControlAdapter.subscribe as jest.Mock;
const TIMEOUT = { success: false, error: "CHIP Error 0x00000032: Timeout" };
const NODE = "0000000000000A07";

/** A promise the test settles by hand. */
function later<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const startSubscribe = () =>
  ESPMatterSubscriptionAdapter.subscribeToDevice(NODE, "fabric", jest.fn());

describe("ESPMatterSubscriptionAdapter.subscribeToDevice", () => {
  beforeEach(() => {
    subscribe.mockReset();
    registerMatterNodeIdMapping(NODE, "0000000000000a07");
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("keeps the link and closes it on unsubscribe", async () => {
    const closeLink = jest.fn();
    subscribe.mockResolvedValue({ success: true, unsubscribe: closeLink });

    await startSubscribe();
    await ESPMatterSubscriptionAdapter.unsubscribeFromDevice(NODE, "fabric");

    expect(closeLink).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the user logs out", async () => {
    subscribe.mockResolvedValue(TIMEOUT);

    const result = startSubscribe();
    await Promise.resolve();
    await endUserSession();

    await expect(result).rejects.toThrow("no longer wanted");
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("closes a link that only opens after logout", async () => {
    const closeLink = jest.fn();
    const pending = later<unknown>();
    subscribe.mockReturnValue(pending.promise);

    const result = startSubscribe();
    await endUserSession();
    pending.resolve({ success: true, unsubscribe: closeLink });

    await expect(result).rejects.toThrow("no longer wanted");
    expect(closeLink).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the device is unsubscribed", async () => {
    subscribe.mockResolvedValue(TIMEOUT);

    const result = startSubscribe();
    await Promise.resolve();
    await ESPMatterSubscriptionAdapter.unsubscribeFromDevice(NODE, "fabric");

    await expect(result).rejects.toThrow("no longer wanted");
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("with the classic SDK subscription channel", () => {
  // The real classic channel: on a failed subscribe it drops the node's
  // callback, so a resubscribe must never make the first request fail.
  const { MatterSubscriptionChannel } = jest.requireActual(
    "@espressif/rainmaker-matter-sdk/dist/cjs/services/ESPMatterSubscriptionChannel/MatterSubscriptionChannel.cjs",
  );
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };

  beforeEach(() => {
    subscribe.mockReset();
    registerMatterNodeIdMapping(NODE, "0000000000000a07");
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("keeps delivering updates after a resubscribe during the first subscribe", async () => {
    const first = later<unknown>();
    const second = later<unknown>();
    subscribe
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const channel = new MatterSubscriptionChannel(
      ESPMatterSubscriptionAdapter,
      async () => "fabric",
    );
    await channel.initialize();
    const onUpdate = jest.fn();

    await channel.subscribe(onUpdate, NODE);
    await settle();
    await channel.unsubscribe(NODE);
    await channel.subscribe(onUpdate, NODE);
    await settle();
    first.resolve({ success: true, unsubscribe: jest.fn() });
    second.resolve({ success: true, unsubscribe: jest.fn() });
    await settle();

    channel.handleMatterUpdate(NODE, {
      endpointId: 1,
      clusterId: 6,
      attributeId: 0,
      value: true,
    });
    expect(channel.subscribedNodes.has(NODE)).toBe(true);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
