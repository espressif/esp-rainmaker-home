/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  clearParamDeliveries,
  noteParamDelivery,
  wasParamDeliveredWithin,
} from "../utils/helpers/paramDeliveryHelpers";

/** Clock the delivery record reads, in ms. */
let now = 0;

describe("paramDeliveryHelpers", () => {
  beforeEach(() => {
    clearParamDeliveries();
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("counts a delivery only within the asked window", () => {
    noteParamDelivery("node-1", { Plug: { Power: true } });
    now += 1_000;

    expect(wasParamDeliveredWithin("node-1", "Plug", "Power", 5_000)).toBe(true);
    now += 5_000;
    expect(wasParamDeliveredWithin("node-1", "Plug", "Power", 5_000)).toBe(false);
  });

  it("tells nodes, devices and params apart", () => {
    noteParamDelivery("node-1", { Plug: { Power: true } });

    expect(wasParamDeliveredWithin("node-2", "Plug", "Power", 5_000)).toBe(false);
    expect(wasParamDeliveredWithin("node-1", "Light", "Power", 5_000)).toBe(false);
    expect(wasParamDeliveredWithin("node-1", "Plug", "Name", 5_000)).toBe(false);
  });

  it("moves the time forward on a later delivery of the same param", () => {
    noteParamDelivery("node-1", { Plug: { Power: true } });
    now += 4_000;
    noteParamDelivery("node-1", { Plug: { Power: false } });
    now += 4_000;

    expect(wasParamDeliveredWithin("node-1", "Plug", "Power", 5_000)).toBe(true);
  });

  it("skips entries that are not a device's params", () => {
    noteParamDelivery("node-1", { Plug: true, Light: ["Power"] });

    expect(wasParamDeliveredWithin("node-1", "Plug", "Power", 5_000)).toBe(false);
    expect(wasParamDeliveredWithin("node-1", "Light", "0", 5_000)).toBe(false);
  });

  it("forgets every delivery when cleared", () => {
    noteParamDelivery("node-1", { Plug: { Power: true } });

    clearParamDeliveries();

    expect(wasParamDeliveredWithin("node-1", "Plug", "Power", 5_000)).toBe(false);
  });
});
