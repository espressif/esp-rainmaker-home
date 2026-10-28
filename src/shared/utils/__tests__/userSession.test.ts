/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  throwIfSessionEnded,
  endUserSession,
  getSessionId,
  isSessionActive,
  onSessionEnd,
  SessionEndedError,
} from "../userSession";

describe("userSession", () => {
  it("work from an ended session sees it is no longer active", async () => {
    const sessionId = getSessionId();
    expect(isSessionActive(sessionId)).toBe(true);

    await endUserSession();

    expect(isSessionActive(sessionId)).toBe(false);
    expect(isSessionActive(getSessionId())).toBe(true);
    expect(() =>
      throwIfSessionEnded(sessionId, "homeLoad"),
    ).toThrow(SessionEndedError);
  });

  it("runs every cleanup even when one of them fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const calls: string[] = [];
    const removeFailing = onSessionEnd(() => {
      calls.push("failing");
      throw new Error("cleanup failed");
    });
    const removeAsync = onSessionEnd(async () => {
      calls.push("async");
    });

    await endUserSession();

    expect(calls.sort()).toEqual(["async", "failing"]);
    expect(warn).toHaveBeenCalledTimes(1);
    removeFailing();
    removeAsync();
    warn.mockRestore();
  });

  it("the session is already ended when cleanups run", async () => {
    const sessionId = getSessionId();
    let seenCurrent: boolean | undefined;
    const remove = onSessionEnd(() => {
      seenCurrent = isSessionActive(sessionId);
    });

    await endUserSession();

    expect(seenCurrent).toBe(false);
    remove();
  });

  it("stops calling a cleanup once it is removed", async () => {
    const cleanup = jest.fn();
    const remove = onSessionEnd(cleanup);
    remove();

    await endUserSession();

    expect(cleanup).not.toHaveBeenCalled();
  });
});
