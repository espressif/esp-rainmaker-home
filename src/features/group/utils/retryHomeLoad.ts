/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { onInternetBack } from "@native-adaptors/utils/internetBack";

/** Waits between automatic retries: 5 s, 10 s, 20 s, 40 s, then every 60 s. */
const FIRST_RETRY_WAIT_MS = 5_000;
const LONGEST_RETRY_WAIT_MS = 60_000;

/**
 * Keeps retrying a home load that failed (e.g. the app started offline)
 * until it works: at once when the internet comes back, otherwise after
 * growing waits. Only one try runs at a time.
 * @param loadHome - Loads the home; resolves when it worked.
 * @param onLoaded - Called once, after the first try that works.
 * @returns Function that stops retrying.
 */
export function retryHomeLoadUntilItWorks(
  loadHome: () => Promise<void>,
  onLoaded: () => void,
): () => void {
  let stopped = false;
  let trying = false;
  /** The internet came back during a try: try again as soon as it ends. */
  let tryAgainAtOnce = false;
  let failedTries = 0;
  /** Wait before the next try after a failed one; doubles up to 60 s. */
  let nextWaitMs = FIRST_RETRY_WAIT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stopListening();
  };

  const scheduleNextTry = (waitMs: number) => {
    clearTimeout(timer);
    if (!stopped) {
      timer = setTimeout(() => void tryNow(), waitMs);
    }
  };

  const tryNow = async () => {
    if (stopped || trying) {
      return;
    }
    clearTimeout(timer);
    trying = true;
    let loaded = false;
    try {
      await loadHome();
      loaded = true;
    } catch (error) {
      failedTries += 1;
      console.warn(
        `[retryHomeLoad] home load try ${failedTries} failed:`,
        error,
      );
    }
    trying = false;
    if (stopped) {
      return;
    }
    if (loaded) {
      stop();
      onLoaded();
      return;
    }
    if (tryAgainAtOnce) {
      tryAgainAtOnce = false;
      void tryNow();
      return;
    }
    scheduleNextTry(nextWaitMs);
    nextWaitMs = Math.min(nextWaitMs * 2, LONGEST_RETRY_WAIT_MS);
  };

  const stopListening = onInternetBack(() => {
    console.log("[retryHomeLoad] Internet is back; loading the home now");
    // A try that fails while the network is still settling retries in 5 s.
    nextWaitMs = FIRST_RETRY_WAIT_MS;
    if (trying) {
      tryAgainAtOnce = true;
      return;
    }
    void tryNow();
  });
  scheduleNextTry(FIRST_RETRY_WAIT_MS);
  nextWaitMs = FIRST_RETRY_WAIT_MS * 2;

  return stop;
}
