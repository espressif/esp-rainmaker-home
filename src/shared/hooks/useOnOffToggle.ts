/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";

import { failIfNoAnswer } from "@shared/utils/deviceWriteTimeout";

export interface UseOnOffToggleOptions {
  /** On/off state the store last reported for the device (re-read every render). */
  storeValue: boolean;
  /** Reads the store right now; `storeValue` can be one render behind. */
  readStoreValue?: () => boolean;
  /** Sends one on/off command to the device. */
  write: (next: boolean) => Promise<unknown>;
  /** Called when a command fails or never answers, after the switch went back. Not called after unmount. */
  onWriteFailed?: (error: unknown) => void;
  /** Store updates are held back this long after the last tap or reply. */
  holdMs: number;
  /** After the hold, a store value that differs from the switch must stay put for `holdMs` before it shows, for up to this long. */
  lateEchoMs: number;
  /** A command with no answer after this long counts as failed. */
  writeTimeoutMs: number;
}

export interface OnOffToggle {
  /** What the switch shows. */
  isOn: boolean;
  /** Call on every tap with the new state. */
  setOn: (next: boolean) => void;
  /**
   * Call on a tap that flips the switch. Flips from the latest tap, not from
   * what was last drawn, so fast taps that land before a redraw all count.
   */
  toggle: () => void;
}

/** idle: follows the store. tapping: the user's taps win. settling: late echoes are smoothed out. */
type Phase = "idle" | "tapping" | "settling";

/**
 * On/off switch that follows every tap at once and makes the device end on the last tap.
 *
 * One command is on its way at a time, so they reach the device in order; taps made
 * meanwhile fold into the latest. Store updates during the taps and the hold after
 * them are remembered but not shown. Then, for `lateEchoMs`, a store value that
 * differs from the switch shows only once it has stayed put for `holdMs`, so echoes
 * of earlier taps cannot walk the switch back and forth. If the store never heard
 * back at all, the switch keeps the tapped state. A failed or unanswered command
 * puts the switch back to the store value and calls `onWriteFailed`.
 * @param options - Store value, the write call, failure callback and timings
 * @returns The state to show and the tap handler
 */
export function useOnOffToggle(options: UseOnOffToggleOptions): OnOffToggle {
  const [isOn, setIsOn] = useState(options.storeValue);

  const latest = useRef(options);
  latest.current = options;

  // Lazy state, not a memo: React may drop memos (Fast Refresh does), which would lose a command in flight.
  const [toggle] = useState(() => {
    let phase: Phase = "idle";
    let mounted = true;
    let shown = latest.current.storeValue;
    let wanted = shown;
    /** What the device was last told during this run of taps. */
    let lastSent: boolean | null = null;
    let sending = false;
    /** Bumped per command and on failure, so a late answer to an old one is ignored. */
    let commandCount = 0;
    let holdUntil = 0;
    let lateEchoUntil = 0;
    let storeAtFirstTap = shown;
    let storeMoved = false;
    let lastStoreChangeAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const readStore = () => {
      const { readStoreValue, storeValue } = latest.current;
      return readStoreValue ? readStoreValue() : storeValue;
    };

    const show = (value: boolean) => {
      shown = value;
      if (mounted) setIsOn(value);
    };

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const checkAgainAt = (at: number) => {
      clearTimer();
      if (!mounted) return;
      timer = setTimeout(reviewStore, Math.max(0, at - Date.now()));
    };

    /** Decides whether the switch should take the store value now. */
    function reviewStore() {
      clearTimer();
      const now = Date.now();
      if (phase === "tapping") {
        if (sending) return; // the answer calls back in here
        if (now < holdUntil) return checkAgainAt(holdUntil);
        phase = "settling";
        lateEchoUntil = now + latest.current.lateEchoMs;
      }
      if (phase !== "settling") return;

      const store = readStore();
      const neverHeardBack = !storeMoved && store === storeAtFirstTap;
      if (now >= lateEchoUntil) {
        phase = "idle";
        if (!neverHeardBack && store !== shown) show(store);
        return;
      }
      if (neverHeardBack || store === shown) return checkAgainAt(lateEchoUntil);
      const quietAt = lastStoreChangeAt + latest.current.holdMs;
      if (now >= quietAt) {
        show(store);
        return checkAgainAt(lateEchoUntil);
      }
      checkAgainAt(Math.min(quietAt, lateEchoUntil));
    }

    function giveUp(error: unknown) {
      commandCount += 1;
      sending = false;
      lastSent = null;
      phase = "idle";
      clearTimer();
      show(readStore());
      if (mounted) latest.current.onWriteFailed?.(error);
    }

    /** Sends the latest tap if the device has not been told it yet. */
    function sendLatestTap() {
      if (wanted === lastSent) {
        sending = false;
        reviewStore();
        return;
      }
      const value = wanted;
      sending = true;
      lastSent = value;
      commandCount += 1;
      const thisCommand = commandCount;
      const { write, writeTimeoutMs } = latest.current;
      failIfNoAnswer(
        Promise.resolve().then(() => write(value)),
        writeTimeoutMs,
      ).then(
        () => {
          if (thisCommand !== commandCount) return;
          holdUntil = Math.max(holdUntil, Date.now() + latest.current.holdMs);
          sendLatestTap();
        },
        (error: unknown) => {
          if (thisCommand === commandCount) giveUp(error);
        },
      );
    }

    function setOn(next: boolean) {
      clearTimer();
      if (phase !== "tapping") {
        phase = "tapping";
        lastSent = null;
        storeMoved = false;
        storeAtFirstTap = readStore();
      }
      wanted = next;
      holdUntil = Date.now() + latest.current.holdMs;
      show(next);
      if (!sending) sendLatestTap();
    }

    return {
      setOn,
      flip: () => setOn(!shown),
      onStoreChange(value: boolean) {
        if (phase === "idle") {
          show(value);
          return;
        }
        storeMoved = true;
        lastStoreChangeAt = Date.now();
        if (phase === "settling") reviewStore();
      },
      mount() {
        mounted = true;
      },
      // Commands already queued still go out, so the device ends on the last tap.
      unmount() {
        mounted = false;
        clearTimer();
      },
    };
  });

  useEffect(() => {
    toggle.onStoreChange(options.storeValue);
  }, [options.storeValue, toggle]);

  useEffect(() => {
    toggle.mount();
    return () => toggle.unmount();
  }, [toggle]);

  return { isOn, setOn: toggle.setOn, toggle: toggle.flip };
}
