/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { endUserSession } from "@shared/utils/userSession";
import { ESPMatterControlAdapter } from "../ESPMatterControlAdapter";
import {
  ESPMatterSubscriptionAdapter,
  isMatterSubscriptionLive,
  registerMatterNodeIdMapping,
} from "../ESPMatterSubscriptionAdapter";

jest.mock("../ESPMatterControlAdapter", () => ({
  ESPMatterControlAdapter: { subscribe: jest.fn(), init: jest.fn() },
}));

const subscribe = ESPMatterControlAdapter.subscribe as jest.Mock;
const HYBRID = "node-living-room";
const MATTER_ID = "AABBCCDD11223344";
const LIVE = { success: true, unsubscribe: jest.fn() };
const FAILED = {
  success: false,
  error: "CHIP Error 0x00000003: Incorrect state",
};

/** The Matter channel subscribes a hybrid under its Matter id. */
const subscribeHybrid = () =>
  ESPMatterSubscriptionAdapter.subscribeToDevice(
    MATTER_ID,
    "fabric",
    jest.fn(),
  );

/** Native link-state reports for the latest subscribe, as the adapter hears them. */
let reportLinkState: (live: boolean) => void = () => {};
/** Native attribute reports for the latest subscribe. */
let deliverReport: (report: object) => void = () => {};

describe("isMatterSubscriptionLive", () => {
  beforeEach(() => {
    subscribe.mockReset();
    subscribe.mockImplementation(
      async (
        _matterNodeId: string,
        _paths: unknown,
        onReport: (report: object) => void,
        onLinkStateChange: (live: boolean) => void,
      ) => {
        deliverReport = onReport;
        reportLinkState = onLinkStateChange;
        return LIVE;
      },
    );
    registerMatterNodeIdMapping(HYBRID, MATTER_ID);
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    await ESPMatterSubscriptionAdapter.unsubscribeFromDevice(
      MATTER_ID,
      "fabric",
    );
  });

  it("is live only once the native layer says the link is established", async () => {
    await subscribeHybrid();
    expect(isMatterSubscriptionLive(HYBRID, MATTER_ID)).toBe(false);

    reportLinkState(true);
    expect(isMatterSubscriptionLive(HYBRID, MATTER_ID)).toBe(true);
  });

  it("is not live while the link re-subscribes or after it failed, and is again once re-established", async () => {
    await subscribeHybrid();
    reportLinkState(true);

    reportLinkState(false); // resubscription attempt or link error
    expect(isMatterSubscriptionLive(HYBRID)).toBe(false);

    reportLinkState(true);
    expect(isMatterSubscriptionLive(HYBRID)).toBe(true);
  });

  it("is not live while a re-armed subscribe keeps failing", async () => {
    await subscribeHybrid();
    reportLinkState(true);

    // A reconnect closes it, and the re-armed subscribe fails.
    await ESPMatterSubscriptionAdapter.unsubscribeFromDevice(
      MATTER_ID,
      "fabric",
    );
    subscribe.mockResolvedValueOnce(FAILED);
    await expect(subscribeHybrid()).rejects.toThrow();
    expect(isMatterSubscriptionLive(HYBRID, MATTER_ID)).toBe(false);

    await subscribeHybrid();
    reportLinkState(true);
    expect(isMatterSubscriptionLive(HYBRID)).toBe(true);
  });

  it("is not live after a minute without a word, and live again once it speaks", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    await subscribeHybrid();
    reportLinkState(true);

    now.mockReturnValue(1_000_000 + 61_000);
    expect(isMatterSubscriptionLive(HYBRID)).toBe(false);

    reportLinkState(true); // native "alive" while reports keep coming
    expect(isMatterSubscriptionLive(HYBRID)).toBe(true);
    now.mockRestore();
  });

  it("is not live once the session ends", async () => {
    await subscribeHybrid();
    reportLinkState(true);

    await endUserSession();

    expect(isMatterSubscriptionLive(HYBRID)).toBe(false);
  });

  it("never lets a failing report handler throw into the native listener, and logs it once", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await ESPMatterSubscriptionAdapter.subscribeToDevice(
      MATTER_ID,
      "fabric",
      () => {
        throw new TypeError("node.getShadowName is not a function");
      },
    );
    const report = { endpoint: 1, clusterId: 6, attributeId: 0, value: true };

    expect(() => deliverReport(report)).not.toThrow();
    expect(() => deliverReport(report)).not.toThrow();
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes("report handler failed"),
      ),
    ).toHaveLength(1);
  });

  it("ignores late news from a link that was replaced", async () => {
    await subscribeHybrid();
    const oldLink = reportLinkState;
    await subscribeHybrid();
    reportLinkState(true);

    oldLink(false);
    expect(isMatterSubscriptionLive(HYBRID)).toBe(true);
  });
});
