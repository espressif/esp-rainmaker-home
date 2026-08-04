/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, type ViewStyle } from "react-native";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from "react-native-reanimated";
import {
  SKELETON_REVEAL_PHASE_EXITING,
  SKELETON_REVEAL_PHASE_LOADING,
  SKELETON_REVEAL_PHASE_READY,
  SKELETON_REVEAL_SHRINK_MS,
  SKELETON_REVEAL_SLIDE_OFFSET,
} from "@shared/utils/constants";

/** Lifecycle phases for skeleton → content reveal. */
export type SkeletonRevealPhase =
  | typeof SKELETON_REVEAL_PHASE_LOADING
  | typeof SKELETON_REVEAL_PHASE_EXITING
  | typeof SKELETON_REVEAL_PHASE_READY;

export interface UseSkeletonRevealResult {
  /** Current reveal phase */
  phase: SkeletonRevealPhase;
  /** True while the skeleton should stay mounted (loading or exiting) */
  showSkeleton: boolean;
  /**
   * True as soon as load ends (during exit + ready) so content rides up with
   * the collapsing skeleton — no blank gap between loader and list.
   */
  showContent: boolean;
  /** Animated style for the collapsing skeleton wrapper */
  skeletonAnimatedStyle: AnimatedStyle<ViewStyle>;
  /** Animated style for the mild content slide-up (synced with skeleton) */
  contentAnimatedStyle: AnimatedStyle<ViewStyle>;
  /**
   * Captures skeleton layout height so the exit can collapse from a known value.
   * @param event - Layout event from the skeleton container
   */
  onSkeletonLayout: (event: LayoutChangeEvent) => void;
}

/**
 * Syncs skeleton collapse with content reveal: when loading ends, content mounts
 * immediately under the skeleton and both move together (skeleton height → 0,
 * content eases up) so there is no blank frame between loader and list.
 * @param isLoading - Initial list-loading flag from the domain hook
 * @returns Phase flags and animated styles for skeleton + content slots
 */
export function useSkeletonReveal(isLoading: boolean): UseSkeletonRevealResult {
  const [phase, setPhase] = useState<SkeletonRevealPhase>(
    isLoading
      ? SKELETON_REVEAL_PHASE_LOADING
      : SKELETON_REVEAL_PHASE_READY,
  );
  const exitStartedRef = useRef(false);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measuredHeight = useSharedValue(0);
  const skeletonHeight = useSharedValue<number | undefined>(undefined);
  const skeletonOpacity = useSharedValue(1);
  const contentTranslateY = useSharedValue(0);
  const contentOpacity = useSharedValue(isLoading ? 0 : 1);

  /**
   * Drops the skeleton after the synced collapse finishes.
   */
  const finishExit = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    setPhase(SKELETON_REVEAL_PHASE_READY);
  }, []);

  useEffect(() => {
    if (isLoading) {
      exitStartedRef.current = false;
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      setPhase(SKELETON_REVEAL_PHASE_LOADING);
      skeletonHeight.value = undefined;
      skeletonOpacity.value = 1;
      contentTranslateY.value = SKELETON_REVEAL_SLIDE_OFFSET;
      contentOpacity.value = 0;
      return;
    }

    if (exitStartedRef.current || phase === SKELETON_REVEAL_PHASE_READY) {
      return;
    }

    exitStartedRef.current = true;
    setPhase(SKELETON_REVEAL_PHASE_EXITING);

    const easing = Easing.out(Easing.cubic);
    const duration = SKELETON_REVEAL_SHRINK_MS;
    const startHeight = measuredHeight.value;

    // Content is visible immediately; both tracks share the same clock.
    contentOpacity.value = withTiming(1, { duration, easing });
    contentTranslateY.value = withTiming(0, { duration, easing });

    skeletonHeight.value = startHeight > 0 ? startHeight : 1;
    skeletonOpacity.value = withTiming(0, {
      duration: Math.round(duration * 0.9),
      easing,
    });
    skeletonHeight.value = withTiming(
      0,
      { duration, easing },
      (finished) => {
        if (finished) {
          runOnJS(finishExit)();
        }
      },
    );

    safetyTimerRef.current = setTimeout(finishExit, duration + 40);
  }, [
    isLoading,
    phase,
    finishExit,
    measuredHeight,
    skeletonHeight,
    skeletonOpacity,
    contentTranslateY,
    contentOpacity,
  ]);

  useEffect(() => {
    return () => {
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
      }
    };
  }, []);

  /**
   * Records the skeleton’s laid-out height for the collapse animation.
   * @param event - Native layout event
   */
  const onSkeletonLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      if (nextHeight > 0) {
        measuredHeight.value = nextHeight;
      }
    },
    [measuredHeight],
  );

  const skeletonAnimatedStyle = useAnimatedStyle(() => {
    if (skeletonHeight.value === undefined) {
      return { opacity: skeletonOpacity.value };
    }
    return {
      height: skeletonHeight.value,
      opacity: skeletonOpacity.value,
      overflow: "hidden" as const,
    };
  }) as AnimatedStyle<ViewStyle>;

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  })) as AnimatedStyle<ViewStyle>;

  return {
    phase,
    showSkeleton:
      phase === SKELETON_REVEAL_PHASE_LOADING ||
      phase === SKELETON_REVEAL_PHASE_EXITING,
    // Mount content as soon as exit starts so it scrolls up with the skeleton.
    showContent:
      phase === SKELETON_REVEAL_PHASE_EXITING ||
      phase === SKELETON_REVEAL_PHASE_READY,
    skeletonAnimatedStyle,
    contentAnimatedStyle,
    onSkeletonLayout,
  };
}
