/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFDevice, ESPCDFNode } from "@store";
import {
  findDeviceNameProblem,
  getDeviceNameMaxLength,
  saveDeviceName,
} from "../deviceNaming";
import {
  canRenameViaMatterNodeLabel,
  isNamedByMatterNodeLabel,
  renameViaMatterNodeLabel,
} from "../matterBasicInformation";
import {
  dropMatterNameRetry,
  pauseMatterNameRetry,
  queueMatterNameRetry,
} from "../matterNameRetry";

jest.mock("../constants", () => ({
  ESPRM_NAME_PARAM_TYPE: "esp.param.name",
  ESPRM_PARAM_WRITE_PROPERTY: "write",
  MATTER_METADATA_KEY: "Matter",
  MATTER_METADATA_DEVICE_NAME_KEY: "deviceName",
}));

jest.mock("../matterBasicInformation", () => ({
  MATTER_NODE_LABEL_MAX_LENGTH: 32,
  isNamedByMatterNodeLabel: jest.fn(),
  canRenameViaMatterNodeLabel: jest.fn(),
  renameViaMatterNodeLabel: jest.fn(),
}));

const mockResumeRetries = jest.fn();
jest.mock("../matterNameRetry", () => ({
  pauseMatterNameRetry: jest.fn(async () => mockResumeRetries),
  queueMatterNameRetry: jest.fn(),
  dropMatterNameRetry: jest.fn(),
}));

const mockedIsNamed = isNamedByMatterNodeLabel as jest.Mock;
const mockedCanRename = canRenameViaMatterNodeLabel as jest.Mock;
const mockedRename = renameViaMatterNodeLabel as jest.Mock;
const mockedQueue = queueMatterNameRetry as jest.Mock;
const mockedDrop = dropMatterNameRetry as jest.Mock;
const mockedPause = pauseMatterNameRetry as jest.Mock;

/** 33 characters: one more than a Matter name holds. */
const NAME_33 = "Living Room Light by the Bookcase";

function matterNode(
  metadata: Record<string, unknown> = {},
  raw: Record<string, unknown> = {},
) {
  return {
    id: "node-1",
    _raw: raw,
    metadata,
    updateMetadata: jest.fn().mockResolvedValue(undefined),
  } as unknown as ESPCDFNode & { updateMetadata: jest.Mock };
}

/** A device whose name lives in the cloud name param. */
function deviceWithNameParam(setValue: jest.Mock) {
  const nameParam = {
    name: "Name",
    type: "esp.param.name",
    properties: ["read", "write"],
    value: "Matter Light",
    setValue,
  };
  const device = {
    name: "Matter Light",
    params: [nameParam],
  } as unknown as ESPCDFDevice;
  return { device, nameParam };
}

describe("findDeviceNameProblem", () => {
  it("refuses an empty or blank name", () => {
    expect(findDeviceNameProblem("", undefined)).toBe("empty");
    expect(findDeviceNameProblem("   ", 32)).toBe("empty");
  });

  it("allows exactly the cap and refuses one more", () => {
    expect(NAME_33).toHaveLength(33);
    expect(findDeviceNameProblem(NAME_33.slice(0, 32), 32)).toBeUndefined();
    expect(findDeviceNameProblem(NAME_33, 32)).toBe("too-long");
  });

  it("ignores spaces around the name", () => {
    expect(findDeviceNameProblem(`  ${NAME_33.slice(0, 32)}  `, 32)).toBeUndefined();
  });

  it("counts the way the device does, so a non-English name cannot overflow it", () => {
    // 11 Chinese characters are 33 bytes on the device.
    expect(findDeviceNameProblem("客厅里的智能吸顶灯光一", 32)).toBe("too-long");
    expect(findDeviceNameProblem("客厅灯", 32)).toBeUndefined();
  });

  it("puts no cap on a cloud-only name", () => {
    expect(findDeviceNameProblem("x".repeat(100), undefined)).toBeUndefined();
  });
});

describe("getDeviceNameMaxLength", () => {
  it("is the Matter name's cap whenever the name also goes to the device", () => {
    mockedIsNamed.mockReturnValue(true);
    expect(getDeviceNameMaxLength(matterNode())).toBe(32);
  });

  it("is unset for a cloud-only node", () => {
    mockedIsNamed.mockReturnValue(false);
    expect(getDeviceNameMaxLength(matterNode())).toBeUndefined();
    expect(getDeviceNameMaxLength(undefined)).toBeUndefined();
  });
});

describe("saveDeviceName", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockedIsNamed.mockReturnValue(true);
    mockedCanRename.mockReturnValue(true);
    mockedRename.mockResolvedValue(true);
  });

  describe("refuses a name that breaks a rule, writing nothing", () => {
    it("too long for the device", async () => {
      const setValue = jest.fn().mockResolvedValue(undefined);
      const { device, nameParam } = deviceWithNameParam(setValue);

      expect(await saveDeviceName(matterNode(), device, NAME_33)).toBe(
        "invalid",
      );
      expect(mockedRename).not.toHaveBeenCalled();
      expect(setValue).not.toHaveBeenCalled();
      expect(nameParam.value).toBe("Matter Light");
    });

    it("blank", async () => {
      const setValue = jest.fn().mockResolvedValue(undefined);
      const { device } = deviceWithNameParam(setValue);

      expect(await saveDeviceName(matterNode(), device, "  ")).toBe("invalid");
      expect(mockedRename).not.toHaveBeenCalled();
      expect(setValue).not.toHaveBeenCalled();
    });

    it("too long, even on a node with no name param", async () => {
      const node = matterNode({ Matter: { deviceName: "Light" } });
      const device = { name: "0x1", params: [] } as unknown as ESPCDFDevice;

      expect(await saveDeviceName(node, device, NAME_33)).toBe("invalid");
      expect(mockedRename).not.toHaveBeenCalled();
      expect(node.updateMetadata).not.toHaveBeenCalled();
    });
  });

  it("saves a long name on a cloud-only node", async () => {
    mockedIsNamed.mockReturnValue(false);
    mockedCanRename.mockReturnValue(false);
    const setValue = jest.fn().mockResolvedValue(undefined);
    const { device } = deviceWithNameParam(setValue);
    const longName = "x".repeat(40);

    expect(await saveDeviceName(matterNode(), device, longName)).toBe("saved");
    expect(setValue).toHaveBeenCalledWith(longName);
    expect(mockedRename).not.toHaveBeenCalled();
    expect(mockedQueue).not.toHaveBeenCalled();
  });

  describe("Matter name and cloud name, every combination", () => {
    it("both written: saved, nothing queued", async () => {
      const setValue = jest.fn().mockResolvedValue(undefined);
      const { device, nameParam } = deviceWithNameParam(setValue);

      const result = await saveDeviceName(matterNode(), device, "Desk Lamp");

      expect(result).toBe("saved");
      expect(mockedRename).toHaveBeenCalledTimes(1);
      expect(setValue).toHaveBeenCalledWith("Desk Lamp");
      expect(mockedRename.mock.invocationCallOrder[0]).toBeLessThan(
        setValue.mock.invocationCallOrder[0],
      );
      expect(nameParam.value).toBe("Desk Lamp");
      expect(device.displayName).toBe("Desk Lamp");
      expect(mockedQueue).not.toHaveBeenCalled();
      // An older name still waiting for the device is no longer needed.
      expect(mockedDrop).toHaveBeenCalledWith("node-1");
    });

    it("holds off older retries until both writes are done", async () => {
      const setValue = jest.fn().mockResolvedValue(undefined);
      const { device } = deviceWithNameParam(setValue);

      await saveDeviceName(matterNode(), device, "Desk Lamp");

      expect(mockedPause).toHaveBeenCalledWith("node-1");
      expect(mockedPause.mock.invocationCallOrder[0]).toBeLessThan(
        mockedRename.mock.invocationCallOrder[0],
      );
      expect(mockResumeRetries).toHaveBeenCalledTimes(1);
      expect(mockResumeRetries.mock.invocationCallOrder[0]).toBeGreaterThan(
        setValue.mock.invocationCallOrder[0],
      );
    });

    it("Matter write throws (inactive session): cloud still written, saved, Matter name queued", async () => {
      mockedRename.mockRejectedValue(
        new Error("SafeChipCalls: write failed at once"),
      );
      const setValue = jest.fn().mockResolvedValue(undefined);
      const { device, nameParam } = deviceWithNameParam(setValue);
      const node = matterNode();

      const result = await saveDeviceName(node, device, "Desk Lamp");

      expect(result).toBe("saved");
      expect(setValue).toHaveBeenCalledWith("Desk Lamp");
      expect(nameParam.value).toBe("Desk Lamp");
      expect(mockedQueue).toHaveBeenCalledWith(node, "Matter Light", "Desk Lamp");
    });

    it("Matter write refused: cloud still written, saved, Matter name queued", async () => {
      mockedRename.mockResolvedValue(false);
      const setValue = jest.fn().mockResolvedValue(undefined);
      const { device } = deviceWithNameParam(setValue);
      const node = matterNode();

      expect(await saveDeviceName(node, device, "Desk Lamp")).toBe("saved");
      expect(setValue).toHaveBeenCalledWith("Desk Lamp");
      expect(mockedQueue).toHaveBeenCalledWith(node, "Matter Light", "Desk Lamp");
    });

    it("Matter written, cloud fails: failed, local name unchanged", async () => {
      const setValue = jest
        .fn()
        .mockRejectedValue(new Error("Node unreachable"));
      const { device, nameParam } = deviceWithNameParam(setValue);

      const result = await saveDeviceName(matterNode(), device, "Desk Lamp");

      expect(result).toBe("failed");
      expect(mockedRename).toHaveBeenCalledTimes(1);
      expect(nameParam.value).toBe("Matter Light");
      expect(mockedQueue).not.toHaveBeenCalled();
      expect(mockedDrop).not.toHaveBeenCalled();
      expect(mockResumeRetries).toHaveBeenCalledTimes(1);
    });

    it("both fail: failed, nothing queued", async () => {
      mockedRename.mockRejectedValue(new Error("No memory"));
      const setValue = jest
        .fn()
        .mockRejectedValue(new Error("Node unreachable"));
      const { device, nameParam } = deviceWithNameParam(setValue);

      expect(await saveDeviceName(matterNode(), device, "Desk Lamp")).toBe(
        "failed",
      );
      expect(setValue).toHaveBeenCalledTimes(1);
      expect(nameParam.value).toBe("Matter Light");
      expect(mockedQueue).not.toHaveBeenCalled();
    });

    it("device not on the local network: cloud written, saved, Matter name queued", async () => {
      mockedCanRename.mockReturnValue(false);
      const setValue = jest.fn().mockResolvedValue(undefined);
      const { device } = deviceWithNameParam(setValue);
      const node = matterNode();

      expect(await saveDeviceName(node, device, "Desk Lamp")).toBe("saved");
      expect(mockedRename).not.toHaveBeenCalled();
      expect(mockedQueue).toHaveBeenCalledWith(node, "Matter Light", "Desk Lamp");
    });

    it("derived Matter node: only the param is written (it carries the Matter name)", async () => {
      const setValue = jest.fn().mockResolvedValue(undefined);
      const { device } = deviceWithNameParam(setValue);
      const node = matterNode({}, { derivedConfig: {} });

      expect(await saveDeviceName(node, device, "Desk Lamp")).toBe("saved");
      expect(mockedRename).not.toHaveBeenCalled();
      expect(mockedQueue).not.toHaveBeenCalled();
      expect(mockedPause).not.toHaveBeenCalled();
    });
  });

  describe("node with no name param (name kept in node metadata)", () => {
    it("keeps the name in node metadata after the Matter name", async () => {
      const node = matterNode({ Matter: { deviceName: "Light" } });
      const device = { name: "0x1", params: [] } as unknown as ESPCDFDevice;

      const result = await saveDeviceName(node, device, "Pure Matter");

      expect(result).toBe("saved");
      expect(mockedRename).toHaveBeenCalledTimes(1);
      expect(node.updateMetadata).toHaveBeenCalledWith({
        Matter: { deviceName: "Pure Matter" },
      });
    });

    it("Matter write throws (inactive session): metadata still saved, Matter name queued", async () => {
      mockedRename.mockRejectedValue(new Error("No memory"));
      const node = matterNode({ Matter: { deviceName: "Light" } });
      const device = { name: "0x1", params: [] } as unknown as ESPCDFDevice;

      expect(await saveDeviceName(node, device, "Pure Matter")).toBe("saved");
      expect(node.updateMetadata).toHaveBeenCalledWith({
        Matter: { deviceName: "Pure Matter" },
      });
      expect(mockedQueue).toHaveBeenCalledWith(node, "0x1", "Pure Matter");
    });

    it("Matter write refused: metadata still saved, Matter name queued", async () => {
      mockedRename.mockResolvedValue(false);
      const node = matterNode({ Matter: { deviceName: "Light" } });
      const device = { name: "0x1", params: [] } as unknown as ESPCDFDevice;

      expect(await saveDeviceName(node, device, "Pure Matter")).toBe("saved");
      expect(node.updateMetadata).toHaveBeenCalled();
      expect(mockedQueue).toHaveBeenCalledWith(node, "0x1", "Pure Matter");
    });

    it("Matter written, metadata fails: saved (the device has it), nothing queued", async () => {
      const node = matterNode({ Matter: { deviceName: "Light" } });
      node.updateMetadata.mockRejectedValue(new Error("offline"));
      const device = { name: "0x1", params: [] } as unknown as ESPCDFDevice;

      expect(await saveDeviceName(node, device, "Pure Matter")).toBe("saved");
      expect(mockedQueue).not.toHaveBeenCalled();
    });

    it("both fail: failed, nothing queued", async () => {
      mockedRename.mockRejectedValue(new Error("No memory"));
      const node = matterNode({ Matter: { deviceName: "Light" } });
      node.updateMetadata.mockRejectedValue(new Error("offline"));
      const device = { name: "0x1", params: [] } as unknown as ESPCDFDevice;

      expect(await saveDeviceName(node, device, "Pure Matter")).toBe("failed");
      expect(mockedQueue).not.toHaveBeenCalled();
      expect(mockResumeRetries).toHaveBeenCalledTimes(1);
    });
  });
});
