/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { retryHomeLoadUntilItWorks } from "../retryHomeLoad";

/** Internet-back listeners the retry registered. */
const mockInternetBackListeners = new Set<() => void>();

jest.mock("@native-adaptors/utils/internetBack", () => ({
  onInternetBack: (listener: () => void) => {
    mockInternetBackListeners.add(listener);
    return () => mockInternetBackListeners.delete(listener);
  },
}));

const internetBack = () => mockInternetBackListeners.forEach((l) => l());
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

describe("retryHomeLoadUntilItWorks", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockInternetBackListeners.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("retries after 5, 10, 20, 40 s, then every 60 s, until it works", async () => {
    const tryTimes: number[] = [];
    const start = Date.now();
    let works = false;
    const loadHome = jest.fn(async () => {
      tryTimes.push((Date.now() - start) / 1000);
      if (!works) throw new Error("Network request failed");
    });
    const onLoaded = jest.fn();
    retryHomeLoadUntilItWorks(loadHome, onLoaded);

    await advance(255_000);
    expect(tryTimes).toEqual([5, 15, 35, 75, 135, 195, 255]);
    expect(onLoaded).not.toHaveBeenCalled();

    works = true;
    await advance(60_000);
    expect(onLoaded).toHaveBeenCalledTimes(1);
    // It stops once loaded, and stops listening for the network.
    await advance(300_000);
    expect(loadHome).toHaveBeenCalledTimes(8);
    expect(mockInternetBackListeners.size).toBe(0);
  });

  it("loads at once when the internet comes back instead of waiting", async () => {
    let works = false;
    const loadHome = jest.fn(async () => {
      if (!works) throw new Error("Network request failed");
    });
    const onLoaded = jest.fn();
    retryHomeLoadUntilItWorks(loadHome, onLoaded);
    await advance(40_000); // tries at 5, 15, 35 s; next one is at 75 s

    works = true;
    internetBack();
    await advance(0);
    expect(loadHome).toHaveBeenCalledTimes(4);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it("tries again right after a try that was running when the internet came back", async () => {
    let finishTry: (error?: Error) => void = () => {};
    const loadHome = jest.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          finishTry = (error) => (error ? reject(error) : resolve());
        }),
    );
    const onLoaded = jest.fn();
    retryHomeLoadUntilItWorks(loadHome, onLoaded);
    await advance(5_000);
    expect(loadHome).toHaveBeenCalledTimes(1);

    internetBack();
    finishTry(new Error("Network request failed"));
    await advance(0);
    expect(loadHome).toHaveBeenCalledTimes(2);

    // That one fails too (network still settling): the next is 5 s away, not 60.
    finishTry(new Error("Network request failed"));
    await advance(5_000);
    expect(loadHome).toHaveBeenCalledTimes(3);
    finishTry();
    await advance(0);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it("does nothing more once stopped", async () => {
    const loadHome = jest.fn(async () => {
      throw new Error("Network request failed");
    });
    const stop = retryHomeLoadUntilItWorks(loadHome, jest.fn());
    stop();
    internetBack();
    await advance(120_000);
    expect(loadHome).not.toHaveBeenCalled();
  });
});
