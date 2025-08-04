/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef } from 'react';

export function useThrottle<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();

      if (lastRun.current && now < lastRun.current + delay) {
        // If the timeout is already scheduled, don't schedule another one
        if (!timeoutRef.current) {
          timeoutRef.current = setTimeout(() => {
            lastRun.current = now;
            callback(...args);
            timeoutRef.current = undefined;
          }, delay - (now - lastRun.current));
        }
        return;
      }

      lastRun.current = now;
      callback(...args);
    },
    [callback, delay]
  ) as T;
} 