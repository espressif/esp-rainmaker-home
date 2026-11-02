/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * When a home sync runs far too long the store gives up on it and starts a
 * fresh one. The old sync may still finish late, so it notes the give-up count
 * when it starts and checks it before every write: once the count has moved
 * on, the store gave up on that sync and it stops.
 */

/** Thrown by a home sync that the store gave up on, before it writes anything. */
export class HomeSyncGivenUpError extends Error {
  /**
   * @param work - Name of the work that stopped, for the message.
   */
  constructor(work: string) {
    super(`${work} stopped: the store gave up on this home sync`);
    this.name = "HomeSyncGivenUpError";
  }
}

/** How many times the store has given up on running home syncs. */
let giveUpCount = 0;
const succeededListeners = new Set<() => void>();

/**
 * The give-up count right now. A home sync saves it when it starts.
 * @returns The current give-up count.
 */
export function getHomeSyncGiveUpCount(): number {
  return giveUpCount;
}

/**
 * Gives up on every home sync started so far: their late writes are skipped.
 */
export function giveUpRunningHomeSyncs(): void {
  giveUpCount += 1;
}

/**
 * Whether the store gave up on a sync since it started.
 * @param giveUpCountAtStart - Count saved with {@link getHomeSyncGiveUpCount}.
 * @returns True once that sync must not write any more.
 */
export function isHomeSyncGivenUp(giveUpCountAtStart: number): boolean {
  return giveUpCountAtStart !== giveUpCount;
}

/**
 * Throws {@link HomeSyncGivenUpError} if the store gave up on this sync. Call
 * it before writing anything.
 * @param giveUpCountAtStart - Count saved with {@link getHomeSyncGiveUpCount}.
 * @param work - Name of the work, for the error message.
 */
export function throwIfHomeSyncGivenUp(
  giveUpCountAtStart: number,
  work: string,
): void {
  if (isHomeSyncGivenUp(giveUpCountAtStart)) {
    throw new HomeSyncGivenUpError(work);
  }
}

/**
 * Runs `listener` after every home sync that worked, whoever started it.
 * @param listener - Called once per sync that worked.
 * @returns Function that removes the listener again.
 */
export function onHomeSyncSucceeded(listener: () => void): () => void {
  succeededListeners.add(listener);
  return () => {
    succeededListeners.delete(listener);
  };
}

/** Tells every listener that a home sync worked. */
export function announceHomeSyncSucceeded(): void {
  for (const listener of [...succeededListeners]) {
    try {
      listener();
    } catch (error) {
      console.warn("[homeSyncTracker] listener failed:", error);
    }
  }
}
