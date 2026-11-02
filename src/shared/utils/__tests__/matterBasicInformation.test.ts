/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { ESPMatterDeviceInfoAdapter } from "@native-adaptors/implementations/ESPMatterDeviceInfoAdapter";
import {
  canRenameViaMatterNodeLabel,
  isNamedByMatterNodeLabel,
  renameViaMatterNodeLabel,
} from "../matterBasicInformation";

jest.mock("@native-adaptors/implementations/ESPMatterDeviceInfoAdapter", () => ({
  MATTER_NODE_LABEL_MAX_LENGTH: 32,
  ESPMatterDeviceInfoAdapter: {
    writeDeviceName: jest.fn(),
    readFirmwareVersion: jest.fn(),
  },
}));

jest.mock("../constants", () => ({
  MATTER_LOCAL_TRANSPORT_KEY: "matter_local",
  NODE_TYPE: { PURE_MATTER: "pure_matter", RAINMAKER_MATTER: "rainmaker_matter" },
}));

jest.mock("../matterDeviceStateEvents", () => ({
  readMatterNodeIdFromCdfNode: (node: { metadata?: { matter_node_id?: string } }) =>
    node.metadata?.matter_node_id,
}));

const writeDeviceName = ESPMatterDeviceInfoAdapter.writeDeviceName as jest.Mock;

const MATTER_ID = "0000000000000A05";

function node({
  hasMatterId = true,
  devices = 1,
  onLan = true,
  type = undefined as string | undefined,
} = {}): ESPCDFNode {
  return {
    id: "node-1",
    type,
    metadata: hasMatterId ? { matter_node_id: MATTER_ID } : {},
    devices: Array.from({ length: devices }, (_, i) => ({ name: `d${i}` })),
    availableTransports: onLan ? { matter_local: { metadata: {} } } : {},
  } as unknown as ESPCDFNode;
}

describe("which nodes carry a Matter name", () => {
  it("a single-device node with a Matter id, on or off the local network", () => {
    expect(isNamedByMatterNodeLabel(node())).toBe(true);
    expect(isNamedByMatterNodeLabel(node({ onLan: false }))).toBe(true);
  });

  it("a RainMaker + Matter device off the local network (no Matter id yet), by its node type", () => {
    const offLan = node({
      hasMatterId: false,
      onLan: false,
      type: "rainmaker_matter",
    });
    expect(isNamedByMatterNodeLabel(offLan)).toBe(true);
    expect(canRenameViaMatterNodeLabel(offLan)).toBe(false);
  });

  it("not a multi-device node or a plain cloud node", () => {
    expect(isNamedByMatterNodeLabel(node({ devices: 2 }))).toBe(false);
    expect(
      isNamedByMatterNodeLabel(node({ hasMatterId: false, onLan: false })),
    ).toBe(false);
  });

  it("can be written only while on the local network", () => {
    expect(canRenameViaMatterNodeLabel(node())).toBe(true);
    expect(canRenameViaMatterNodeLabel(node({ onLan: false }))).toBe(false);
  });
});

describe("renameViaMatterNodeLabel", () => {
  it("sends the name as is, never cut", async () => {
    writeDeviceName.mockResolvedValue(true);
    const longName = "x".repeat(40);

    await renameViaMatterNodeLabel(node(), longName);

    expect(writeDeviceName).toHaveBeenCalledWith(MATTER_ID, longName);
  });
});
