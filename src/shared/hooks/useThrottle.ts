/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef } from "react";

const THROTTLE_LOG = "[useThrottle]";

/**
 * Async “queue” mode: serial drains with **latest args only** (intermediate invocations are dropped),
 * optional minimum spacing between iterations when backlog remains, optional loading callbacks.
 */
export type UseThrottleOptions = {
  /**
   * When set, skips time-based throttle scheduling for the returned function; updates are coalesced
   * into one serial async drain (latest invocation wins).
   */
  throttleWithLoading?: boolean;
  /**
   * When `throttleWithLoading` is set: `true` while work is draining, `false` shortly after idle.
   */
  setLoadingWhilePending?: (loading: boolean) => void;
};

/**
 * Time-throttles a callback, or—in `throttleWithLoading` mode—coalesces to latest args with a serial
 * async drain and optional spacing between backlog iterations.
 * @param callback - Invocation to throttle or place in the async drain (may return a Promise)
 * @param delay - Sync mode: minimum ms between fires. Async mode with `delay > 0`: wait after each
 *   drained call when newer args were queued during the async work
 * @param options - Pass `throttleWithLoading` + `setLoadingWhilePending` for the async-queue model
 * @returns Throttled function with the same call signature as `callback`
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  options?: UseThrottleOptions,
): T {
  const lastRun = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestArgsRef = useRef<Parameters<T> | null>(null);
  const isDrainingRef = useRef(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const setLoadingRef = useRef<UseThrottleOptions["setLoadingWhilePending"] | null>(null);
  setLoadingRef.current = options?.setLoadingWhilePending ?? null;

  /** Starts or piggybacks the single async drain loop (caller must assign `latestArgsRef` immediately before invoking this). */
  const runAsyncDrain = useCallback(() => {
    /**
     * Processes the pending-args ref repeatedly; each iteration runs stored args (latest overwrite wins).
     */
    const drain = async (): Promise<void> => {
      if (isDrainingRef.current) {
        return;
      }
      isDrainingRef.current = true;
      try {
        while (latestArgsRef.current !== null) {
          const argsToRun = latestArgsRef.current;
          latestArgsRef.current = null;
          setLoadingRef.current?.(true);
          try {
            await Promise.resolve(callbackRef.current(...argsToRun));
          } catch (err: unknown) {
            console.warn(THROTTLE_LOG, "callback failed", err);
          }
          if (latestArgsRef.current !== null && delay > 0) {
            await new Promise<void>((resolve) => {
              setTimeout(resolve, delay);
            });
          }
        }
      } finally {
        isDrainingRef.current = false;
        setTimeout(() => {
          if (latestArgsRef.current === null) {
            setLoadingRef.current?.(false);
          }
        }, 100);
      }
    };
    void drain();
  }, [delay]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (options?.throttleWithLoading) {
        latestArgsRef.current = args;
        runAsyncDrain();
        return;
      }

      const now = Date.now();

      if (lastRun.current && now < lastRun.current + delay) {
        if (!timeoutRef.current) {
          timeoutRef.current = setTimeout(() => {
            lastRun.current = now;
            callbackRef.current(...args);
            timeoutRef.current = null;
          }, delay - (now - lastRun.current));
        }
        return;
      }

      lastRun.current = now;
      callbackRef.current(...args);
    },
    [delay, options?.throttleWithLoading, runAsyncDrain],
  ) as T;
}