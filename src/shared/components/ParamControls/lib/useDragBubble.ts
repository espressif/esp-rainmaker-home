/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type UseDragBubbleOptions = {
  /**
   * Hide the bubble after this many idle ms with no slide-move events.
   * Acts as a fail-safe when Tamagui's pan responder is interrupted by a
   * parent ScrollView and `onSlideEnd` never fires.
   */
  idleMs?: number;
  /**
   * Max ms the bubble can stay visible after a press that never produced any
   * movement (e.g. a stray tap on the track).
   */
  maxIdleMs?: number;
};

/**
 * Drives slider drag-bubble visibility with an idle fail-safe.
 *
 * Tamagui's slider pan responder does not always emit `onSlideEnd` when a
 * parent ScrollView reclaims the touch sequence, which previously left the
 * bubble visible indefinitely. The returned handlers reset an idle timer on
 * every move so the bubble disappears even when the gesture is interrupted.
 */
export function useDragBubble({
  idleMs = 180,
  maxIdleMs = 800,
}: UseDragBubbleOptions = {}) {
  const [isDragging, setIsDragging] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(
    (delay: number) => {
      clearIdleTimer();
      idleTimer.current = setTimeout(() => {
        setIsDragging(false);
        idleTimer.current = null;
      }, delay);
    },
    [clearIdleTimer],
  );

  const onSlideStart = useCallback(() => {
    setIsDragging(true);
    scheduleHide(maxIdleMs);
  }, [scheduleHide, maxIdleMs]);

  const onSlideTick = useCallback(() => {
    setIsDragging(true);
    scheduleHide(idleMs);
  }, [scheduleHide, idleMs]);

  const onSlideEnd = useCallback(() => {
    clearIdleTimer();
    setIsDragging(false);
  }, [clearIdleTimer]);

  useEffect(() => () => clearIdleTimer(), [clearIdleTimer]);

  return { isDragging, onSlideStart, onSlideTick, onSlideEnd };
}
