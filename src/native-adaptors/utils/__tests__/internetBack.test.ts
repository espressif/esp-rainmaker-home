/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { onInternetBack } from "../internetBack";

type State = { isConnected?: boolean; isInternetReachable?: boolean };

let mockEmit: (state: State) => void = () => {};
let mockStartState: State = { isConnected: true, isInternetReachable: true };
const mockRemove = jest.fn();

jest.mock("expo-network", () => ({
  addNetworkStateListener: (listener: (state: State) => void) => {
    mockEmit = listener;
    return { remove: () => mockRemove() };
  },
  getNetworkStateAsync: async () => mockStartState,
}));

const offline: State = { isConnected: false, isInternetReachable: false };
const online: State = { isConnected: true, isInternetReachable: true };

/** Lets the starting-state read settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("onInternetBack", () => {
  beforeEach(() => {
    mockRemove.mockClear();
  });

  it("calls back when the internet returns after being offline", async () => {
    mockStartState = online;
    const back = jest.fn();
    const stop = onInternetBack(back);
    await settle();

    mockEmit(online);
    expect(back).not.toHaveBeenCalled();
    mockEmit(offline);
    mockEmit(online);
    expect(back).toHaveBeenCalledTimes(1);
    // A second network event while still online is not a return.
    mockEmit(online);
    expect(back).toHaveBeenCalledTimes(1);
    stop();
  });

  it("counts a start offline, then Wi-Fi on, as a return", async () => {
    mockStartState = offline;
    const back = jest.fn();
    const stop = onInternetBack(back);
    await settle();

    mockEmit(online);
    expect(back).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops listening to the network once the last listener goes", async () => {
    const first = onInternetBack(() => {});
    const second = onInternetBack(() => {});
    first();
    expect(mockRemove).not.toHaveBeenCalled();
    second();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
