/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { pickHomeEmptyListState } from "../homeListState";

const base = {
  isLoading: false,
  homeLoadFailed: false,
  deviceCount: 0,
  showsGroupControls: false,
};

describe("pickHomeEmptyListState", () => {
  it("offers to add a first device only when the home loaded empty", () => {
    expect(pickHomeEmptyListState(base)).toBe("addFirstDevice");
  });

  it("shows the retry notice, not 'add your first device', when the load failed", () => {
    expect(pickHomeEmptyListState({ ...base, homeLoadFailed: true })).toBe(
      "loadFailed",
    );
  });

  it("shows skeletons while the home is still loading", () => {
    expect(
      pickHomeEmptyListState({ ...base, isLoading: true, homeLoadFailed: true }),
    ).toBe("loading");
  });

  it("shows nothing extra when there are devices or control groups", () => {
    expect(
      pickHomeEmptyListState({ ...base, homeLoadFailed: true, deviceCount: 2 }),
    ).toBe("nothing");
    expect(
      pickHomeEmptyListState({ ...base, showsGroupControls: true }),
    ).toBe("nothing");
  });
});
