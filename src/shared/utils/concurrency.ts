/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runs async work over `items` with at most `limit` tasks in flight at once.
 * Results keep input order. A rejecting worker fails the whole call — catch inside
 * the worker when individual failures should be ignored.
 * @param items - Items to process
 * @param limit - Max concurrent workers (clamped to at least 1)
 * @param worker - Async work for one item; `signal` aborts when `timeoutMs` elapses
 * @param timeoutMs - Optional per-item timeout; aborts that item's `signal`
 * @returns One result per item, in the same order as `items`
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number, signal: AbortSignal) => Promise<R>,
  timeoutMs?: number,
): Promise<R[]> {
  if (items.length === 0) return [];
  const concurrency = Math.max(1, Math.min(Math.floor(limit), items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  /**
   * Claims the next index until the queue is empty.
   */
  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      const controller = new AbortController();
      const timeoutId =
        timeoutMs != null && timeoutMs > 0
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined;
      try {
        results[index] = await worker(items[index], index, controller.signal);
      } finally {
        if (timeoutId != null) clearTimeout(timeoutId);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return results;
}
