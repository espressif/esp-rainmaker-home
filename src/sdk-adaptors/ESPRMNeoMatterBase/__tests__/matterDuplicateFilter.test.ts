/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  clearParamDeliveries,
  noteParamDelivery,
} from "@sdk-adaptors/ESPRMNeoBase/utils/helpers/paramDeliveryHelpers";
import { createMatterDuplicateFilter } from "../utils/matterDuplicateFilter";

/** SDK nodes in the store; `onHomeNetwork` marks one Matter serves. */
const mockStoreNodes: Record<string, { _raw: object }> = {
  // Power rides the Matter link; the name does not.
  hybrid: {
    _raw: {
      onHomeNetwork: true,
      matterNodeId: "AABBCCDD11223344",
      matterParamIndex: { "Plug::Power": {} },
    },
  },
  "cloud-plug": { _raw: { onHomeNetwork: false } },
};

jest.mock("@store", () => ({
  ESPCDF: {
    instance: {
      nodeStore: { getNodeById: (id: string) => mockStoreNodes[id] },
    },
  },
}));
jest.mock(
  "@sdk-adaptors/ESPRMNeoBase/utils/helpers/cdfStoreSinkHelpers",
  () => ({
    isServedByAnotherChannel: (node: { onHomeNetwork?: boolean }) =>
      node.onHomeNetwork === true,
  }),
);

/** The cloud's report of the plug turning off. */
const cloudOff = { state: { reported: { params: { Plug: { Power: false } } } } };

/** Clock the filter and the delivery record read, in ms. */
let now = 0;

describe("createMatterDuplicateFilter", () => {
  beforeEach(() => {
    clearParamDeliveries();
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("drops the cloud's late copy of what Matter delivered a second ago, keeping cloud-only params", () => {
    const filter = createMatterDuplicateFilter(() => true);
    noteParamDelivery("hybrid", { Plug: { Power: false } });
    now += 1_000;
    const offAndRename = {
      state: {
        reported: { params: { Plug: { Power: false, Name: "Desk Plug" } } },
      },
    };

    expect(filter("hybrid", offAndRename)).toEqual({
      state: { reported: { params: { Plug: { Name: "Desk Plug" } } } },
    });
    expect(filter("hybrid", cloudOff)).toBeNull();
  });

  it("keeps the cloud's value when Matter delivered nothing, like a schedule run on the board", () => {
    const filter = createMatterDuplicateFilter(() => true);

    expect(filter("hybrid", cloudOff)).toEqual(cloudOff);
  });

  it("keeps the cloud's value once the Matter delivery is older than a few seconds", () => {
    const filter = createMatterDuplicateFilter(() => true);
    noteParamDelivery("hybrid", { Plug: { Power: false } });
    now += 10_000;

    expect(filter("hybrid", cloudOff)).toEqual(cloudOff);
  });

  it("does not count a raw Matter report that was never mapped to a param", () => {
    const filter = createMatterDuplicateFilter(() => true);
    noteParamDelivery("hybrid", { "0x1": { cluster_6_attr_0: false } });
    now += 1_000;

    expect(filter("hybrid", cloudOff)).toEqual(cloudOff);
  });

  it("applies every cloud update while the link is not live, and drops copies again once it recovers", () => {
    let live = false;
    const filter = createMatterDuplicateFilter(() => live);
    noteParamDelivery("hybrid", { Plug: { Power: false } });
    now += 1_000;

    expect(filter("hybrid", cloudOff)).toBe(cloudOff);
    live = true;
    expect(filter("hybrid", cloudOff)).toBeNull();
  });

  it("asks about the node under both of its ids", () => {
    const isLinkLive = jest.fn(() => false);

    createMatterDuplicateFilter(isLinkLive)("hybrid", cloudOff);

    expect(isLinkLive).toHaveBeenCalledWith("hybrid", "AABBCCDD11223344");
  });

  it("leaves a node the cloud serves alone", () => {
    const filter = createMatterDuplicateFilter(() => true);
    noteParamDelivery("cloud-plug", { Plug: { Power: false } });

    expect(filter("cloud-plug", cloudOff)).toBe(cloudOff);
  });
});
