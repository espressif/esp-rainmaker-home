/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from "@testing-library/react-native";
import { useOnOffToggle } from "../useOnOffToggle";

const HOLD_MS = 1000;
const LATE_ECHO_MS = 3000;
const TIMEOUT_MS = 10000;
/** Long enough for any hold and late-echo window to be over. */
const SETTLED_MS = HOLD_MS + LATE_ECHO_MS + 1000;

/** A fake device: each command takes `replyMs` (or never answers), replies in order. */
function makeDevice(replyMs: number | "never") {
  const sent: boolean[] = [];
  let busy = 0;
  let mostBusy = 0;
  let failNext: Error | null = null;
  const write = jest.fn((next: boolean) => {
    sent.push(next);
    if (replyMs === "never") return new Promise<void>(() => undefined);
    busy += 1;
    mostBusy = Math.max(mostBusy, busy);
    const error = failNext;
    failNext = null;
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        busy -= 1;
        if (error) reject(error);
        else resolve();
      }, replyMs);
    });
  });
  return {
    write,
    sent,
    mostBusy: () => mostBusy,
    failNextCommand: (error: Error) => {
      failNext = error;
    },
  };
}

/** Renders the hook with a store value the test can change, like a store update. */
function renderToggle(
  device: ReturnType<typeof makeDevice>,
  storeValue: boolean,
  onWriteFailed?: (error: unknown) => void,
) {
  return renderHook(
    ({ store }: { store: boolean }) =>
      useOnOffToggle({
        storeValue: store,
        write: device.write,
        onWriteFailed,
        holdMs: HOLD_MS,
        lateEchoMs: LATE_ECHO_MS,
        writeTimeoutMs: TIMEOUT_MS,
      }),
    { initialProps: { store: storeValue } },
  );
}

/** Moves fake time forward and lets promise callbacks run. */
async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/** Taps the way the power button does: asks for the opposite of what it shows. */
function tap(result: { current: ReturnType<typeof useOnOffToggle> }) {
  act(() => {
    result.current.setOn(!result.current.isOn);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useOnOffToggle", () => {
  it("flips on every tap at once, even while a command is still on its way", async () => {
    const device = makeDevice(500);
    const { result } = renderToggle(device, true);

    const shown: boolean[] = [];
    for (let i = 0; i < 6; i += 1) {
      tap(result);
      shown.push(result.current.isOn);
      await wait(350);
    }

    expect(shown).toEqual([false, true, false, true, false, true]);
  });

  it("ends the device on the last tap, one command at a time, in order", async () => {
    const device = makeDevice(500);
    const { result } = renderToggle(device, true);

    // 6 taps 0.35 s apart from ON: the light must end ON.
    for (let i = 0; i < 6; i += 1) {
      tap(result);
      await wait(350);
    }
    await wait(SETTLED_MS);

    expect(device.sent[device.sent.length - 1]).toBe(true);
    expect(device.mostBusy()).toBe(1);
    expect(result.current.isOn).toBe(true);
  });

  it("counts every toggle even when taps land before the switch redraws", async () => {
    const device = makeDevice(500);
    const { result } = renderToggle(device, true);
    // All taps use the toggle from before any redraw, like a Switch whose
    // shown value lags behind fast taps on a busy phone.
    const { toggle } = result.current;

    // 4 taps from ON: the light must end ON (asking for "not what is drawn"
    // four times would wrongly end OFF).
    act(() => {
      for (let i = 0; i < 4; i += 1) toggle();
    });
    await wait(SETTLED_MS);

    expect(result.current.isOn).toBe(true);
    expect(device.sent[device.sent.length - 1]).toBe(true);
  });

  it("handles 10 taps 0.2 s apart with 0.5 s replies", async () => {
    const device = makeDevice(500);
    const { result } = renderToggle(device, false);

    const shown: boolean[] = [];
    for (let i = 0; i < 10; i += 1) {
      tap(result);
      shown.push(result.current.isOn);
      await wait(200);
    }
    await wait(SETTLED_MS);

    expect(shown).toEqual([
      true, false, true, false, true, false, true, false, true, false,
    ]);
    // 10 taps from OFF end OFF; replies are slower than taps, so some fold.
    expect(device.sent[device.sent.length - 1]).toBe(false);
    expect(device.mostBusy()).toBe(1);
    expect(result.current.isOn).toBe(false);
  });

  it("does not resend when taps during a command cancel each other out", async () => {
    const device = makeDevice(500);
    const { result } = renderToggle(device, true);

    tap(result); // OFF goes out
    await wait(100);
    tap(result); // ON
    await wait(100);
    tap(result); // OFF again: same as what the device was told
    await wait(SETTLED_MS);

    expect(device.sent).toEqual([false]);
    expect(result.current.isOn).toBe(false);
  });

  it("sends every tap when each command finishes before the next tap", async () => {
    const device = makeDevice(150);
    const { result } = renderToggle(device, false);

    for (let i = 0; i < 10; i += 1) {
      tap(result);
      await wait(200);
    }
    await wait(SETTLED_MS);

    expect(device.sent).toEqual([
      true, false, true, false, true, false, true, false, true, false,
    ]);
    expect(result.current.isOn).toBe(false);
  });

  it("holds back store updates while tapping", async () => {
    const device = makeDevice(300);
    const { result, rerender } = renderToggle(device, true);

    tap(result); // OFF
    await wait(400);
    rerender({ store: false });
    rerender({ store: true }); // a late echo of the old state
    expect(result.current.isOn).toBe(false);

    await wait(HOLD_MS - 200);
    expect(result.current.isOn).toBe(false);

    rerender({ store: false }); // the device's real state lands
    await wait(SETTLED_MS);
    expect(result.current.isOn).toBe(false);

    rerender({ store: true }); // switched at the wall later: shown at once
    expect(result.current.isOn).toBe(true);
  });

  it("follows the store when it is changed back during the hold", async () => {
    const device = makeDevice(200);
    const { result, rerender } = renderToggle(device, false);

    tap(result); // ON
    await wait(250);
    rerender({ store: true }); // the reply
    await wait(300);
    rerender({ store: false }); // the device's own button turns it OFF again
    expect(result.current.isOn).toBe(true);

    await wait(HOLD_MS + 500);
    expect(result.current.isOn).toBe(false);
  });

  it("does not let late echoes walk the switch after the hold", async () => {
    const device = makeDevice(100);
    const { result, rerender } = renderToggle(device, false);

    for (let i = 0; i < 4; i += 1) {
      tap(result); // ON, OFF, ON, OFF
      await wait(150);
    }
    rerender({ store: false }); // the store took the last value
    await wait(1200); // the hold is over

    const shown: boolean[] = [];
    for (const echo of [true, false, true, false]) {
      rerender({ store: echo });
      shown.push(result.current.isOn);
      await wait(200);
    }
    await wait(SETTLED_MS);

    expect(shown).toEqual([false, false, false, false]);
    expect(result.current.isOn).toBe(false);
  });

  it("shows a real change that stays put during the late-echo window", async () => {
    const device = makeDevice(100);
    const { result, rerender } = renderToggle(device, false);

    tap(result); // ON
    await wait(200);
    rerender({ store: true }); // the reply
    await wait(HOLD_MS + 200); // hold over, late-echo window running
    rerender({ store: false }); // another phone turns it OFF
    expect(result.current.isOn).toBe(true);

    await wait(HOLD_MS + 100);
    expect(result.current.isOn).toBe(false);
  });

  it("keeps the tapped state when the store never hears back", async () => {
    const device = makeDevice(300);
    const { result } = renderToggle(device, true);

    tap(result); // OFF, and no store update ever comes
    await wait(SETTLED_MS * 2);

    expect(result.current.isOn).toBe(false);
  });

  it("shows store updates at once when the user is not tapping", () => {
    const device = makeDevice(300);
    const { result, rerender } = renderToggle(device, false);

    rerender({ store: true });
    expect(result.current.isOn).toBe(true);
    rerender({ store: false });
    expect(result.current.isOn).toBe(false);
    expect(device.write).not.toHaveBeenCalled();
  });

  it("goes back to the store value and reports the error when a command fails", async () => {
    const device = makeDevice(300);
    const onWriteFailed = jest.fn();
    const { result } = renderToggle(device, true, onWriteFailed);
    const error = new Error("unreachable");

    device.failNextCommand(error);
    tap(result); // OFF fails
    await wait(100);
    tap(result); // ON, waiting behind the failing command
    await wait(100);
    tap(result); // OFF, waiting behind the failing command
    expect(result.current.isOn).toBe(false);

    await wait(200);
    expect(onWriteFailed).toHaveBeenCalledWith(error);
    expect(result.current.isOn).toBe(true);

    // Waiting taps are dropped with the failure.
    await wait(SETTLED_MS);
    expect(device.sent).toEqual([false]);
  });

  it("gives up on a command that never answers and frees the switch", async () => {
    const device = makeDevice("never");
    const onWriteFailed = jest.fn();
    const { result, rerender } = renderToggle(device, false, onWriteFailed);

    tap(result); // ON, never answered
    await wait(100);
    tap(result); // OFF, waiting
    await wait(TIMEOUT_MS);

    expect(onWriteFailed).toHaveBeenCalledTimes(1);
    expect(onWriteFailed.mock.calls[0][0]).toMatchObject({
      code: "DEVICE_NO_ANSWER",
    });
    expect(device.sent).toEqual([true]);
    expect(result.current.isOn).toBe(false);

    rerender({ store: true }); // the store works again
    expect(result.current.isOn).toBe(true);
    tap(result); // and taps go out again
    await wait(0);
    expect(device.sent).toEqual([true, false]);
  });

  it("still sends the last tap after the screen closes, without reporting", async () => {
    const device = makeDevice(300);
    const onWriteFailed = jest.fn();
    const { result, unmount } = renderToggle(device, false, onWriteFailed);

    tap(result); // ON
    tap(result); // OFF, waiting
    unmount();
    await wait(SETTLED_MS);
    expect(device.sent).toEqual([true, false]);

    const failing = makeDevice(300);
    const second = renderToggle(failing, false, onWriteFailed);
    failing.failNextCommand(new Error("unreachable"));
    tap(second.result);
    second.unmount();
    await wait(SETTLED_MS);
    expect(onWriteFailed).not.toHaveBeenCalled();
  });

  it("sends a new tap even when it matches the last command of an earlier run", async () => {
    const device = makeDevice(100);
    const { result, rerender } = renderToggle(device, false);

    tap(result); // ON
    await wait(200);
    rerender({ store: true }); // the device's reply
    await wait(SETTLED_MS);
    rerender({ store: false }); // switched off at the wall
    expect(result.current.isOn).toBe(false);

    tap(result); // ON again
    await wait(SETTLED_MS);

    expect(device.sent).toEqual([true, true]);
  });
});
