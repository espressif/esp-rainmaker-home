/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What happens when a signed-in session ends (logout or SDK switch):
 * registered cleanups run, and work started by the old session stops writing.
 */

type SessionCleanup = () => void | Promise<void>;

/** Thrown by work that finds its session already ended before it could write. */
export class SessionEndedError extends Error {
  /**
   * @param work - Name of the work that stopped, for the message.
   */
  constructor(work: string) {
    super(`${work} stopped: the session that started it has ended`);
    this.name = "SessionEndedError";
  }
}

const sessionCleanups = new Set<SessionCleanup>();

let currentSessionId = 0;

/**
 * Runs `cleanup` every time a session ends.
 * @param cleanup - Releases what the caller holds for the session.
 * @returns Function that removes the cleanup again.
 */
export function onSessionEnd(cleanup: SessionCleanup): () => void {
  sessionCleanups.add(cleanup);
  return () => {
    sessionCleanups.delete(cleanup);
  };
}

/**
 * Id of the session that is active now. Save it when async work starts.
 * @returns The active session id.
 */
export function getSessionId(): number {
  return currentSessionId;
}

/**
 * Whether the session with this id is still the active one.
 * @param sessionId - Id saved earlier with {@link getSessionId}.
 * @returns `false` once that session has ended.
 */
export function isSessionActive(sessionId: number): boolean {
  return sessionId === currentSessionId;
}

/**
 * Throws {@link SessionEndedError} if the session has ended. Call it before
 * writing anything to the store.
 * @param sessionId - Id saved earlier with {@link getSessionId}.
 * @param work - Name of the work, for the error message.
 */
export function throwIfSessionEnded(sessionId: number, work: string): void {
  if (!isSessionActive(sessionId)) {
    throw new SessionEndedError(work);
  }
}

/**
 * Ends the active session: old work stops at its next check, then every
 * cleanup runs. One failing cleanup does not stop the others.
 */
export async function endUserSession(): Promise<void> {
  currentSessionId += 1;
  const results = await Promise.allSettled(
    Array.from(sessionCleanups, (cleanup) => Promise.resolve().then(cleanup)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[userSession] session cleanup failed:", result.reason);
    }
  }
}
