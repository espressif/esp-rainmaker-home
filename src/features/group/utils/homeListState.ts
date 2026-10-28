/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** What Home shows where its device list would be when it has no devices. */
export type HomeEmptyListState =
  | "loading"
  | "loadFailed"
  | "addFirstDevice"
  | "nothing";

/**
 * Picks what Home shows in place of an empty device list. "Add your first
 * device" is only for a home that loaded and really has no devices; a home
 * that could not be loaded keeps its skeletons with a retry notice.
 * @param state - Home load state and what the list would show.
 * @returns The empty-list content to show.
 */
export function pickHomeEmptyListState(state: {
  isLoading: boolean;
  homeLoadFailed: boolean;
  deviceCount: number;
  showsGroupControls: boolean;
}): HomeEmptyListState {
  if (state.deviceCount > 0 || state.showsGroupControls) {
    return "nothing";
  }
  if (state.isLoading) {
    return "loading";
  }
  if (state.homeLoadFailed) {
    return "loadFailed";
  }
  return "addFirstDevice";
}
