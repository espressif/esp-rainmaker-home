/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import {
  canRenameViaMatterNodeLabel,
  renameViaMatterNodeLabel,
} from "../matterBasicInformation";
import { endUserSession } from "../userSession";
import {
  dropMatterNameRetry,
  pauseMatterNameRetry,
  queueMatterNameRetry,
  registerMatterNameRetryNodeLookup,
  retryMatterNameNow,
} from "../matterNameRetry";

jest.mock("../constants", () => ({
  ESPRM_NAME_PARAM_TYPE: "esp.param.name",
  ESPRM_PARAM_WRITE_PROPERTY: "write",
  MATTER_METADATA_KEY: "Matter",
  MATTER_METADATA_DEVICE_NAME_KEY: "deviceName",
}));
jest.mock("../matterBasicInformation", () => ({
  canRenameViaMatterNodeLabel: jest.fn(),
  renameViaMatterNodeLabel: jest.fn(),
}));

const mockedCanRename = canRenameViaMatterNodeLabel as jest.Mock;
const mockedWrite = renameViaMatterNodeLabel as jest.Mock;

/** The store's node: a light whose cloud name is `currentName`. */
function storeNode(currentName: string): ESPCDFNode {
  return {
    id: "node-1",
    metadata: {},
    devices: [
      {
        name: "Light",
        params: [
          {
            name: "Name",
            type: "esp.param.name",
            properties: ["read", "write"],
            value: currentName,
          },
        ],
      },
    ],
  } as unknown as ESPCDFNode;
}

/** The store's node for a pure Matter light whose name lives in node metadata. */
function metadataNamedNode(currentName: string): ESPCDFNode {
  return {
    id: "node-1",
    metadata: { Matter: { deviceName: currentName } },
    devices: [{ name: "Light", params: [] }],
  } as unknown as ESPCDFNode;
}

/** Lets pending promise callbacks run. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

describe("matterNameRetry", () => {
  let current: ESPCDFNode | undefined;

  beforeEach(async () => {
    jest.useFakeTimers();
    await endUserSession();
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockedCanRename.mockReturnValue(true);
    mockedWrite.mockResolvedValue(true);
    current = storeNode("Desk Lamp");
    registerMatterNameRetryNodeLookup(() => current);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("retries 10 s after the failure, then forgets the name once written", async () => {
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");

    await jest.advanceTimersByTimeAsync(9_999);
    expect(mockedWrite).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockedWrite).toHaveBeenCalledWith(current, "Desk Lamp");

    await jest.advanceTimersByTimeAsync(200_000);
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying at 30 s and 2 min while the device refuses", async () => {
    mockedWrite.mockRejectedValueOnce(new Error("session inactive"));
    mockedWrite.mockResolvedValueOnce(false);
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");

    await jest.advanceTimersByTimeAsync(10_000);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(mockedWrite).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(mockedWrite).toHaveBeenCalledTimes(3);
  });

  it("waits while the device is off the local network, then writes when it is found", async () => {
    mockedCanRename.mockReturnValue(false);
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");

    await jest.advanceTimersByTimeAsync(200_000);
    expect(mockedWrite).not.toHaveBeenCalled();

    mockedCanRename.mockReturnValue(true);
    expect(await retryMatterNameNow("node-1")).toBe(true);
    expect(mockedWrite).toHaveBeenCalledWith(current, "Desk Lamp");
  });

  it("never undoes a newer rename made on another phone", async () => {
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");
    // Another phone renamed it before the retry ran.
    current = storeNode("Kitchen Light");

    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockedWrite).not.toHaveBeenCalled();

    // Dropped for good, not just skipped.
    current = storeNode("Desk Lamp");
    expect(await retryMatterNameNow("node-1")).toBe(false);
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it("keeps only the newest name", async () => {
    queueMatterNameRetry(storeNode("Old"), "Light", "Old");
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");

    await jest.advanceTimersByTimeAsync(10_000);

    expect(mockedWrite).toHaveBeenCalledTimes(1);
    expect(mockedWrite).toHaveBeenCalledWith(current, "Desk Lamp");
  });

  it("does nothing while this phone is renaming the node", async () => {
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");
    const resume = await pauseMatterNameRetry("node-1");

    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockedWrite).not.toHaveBeenCalled();

    resume();
    expect(await retryMatterNameNow("node-1")).toBe(true);
  });

  it("a rename waits for a retry write already on its way, so its own write lands last", async () => {
    let finishRetry: (written: boolean) => void = () => undefined;
    mockedWrite.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishRetry = resolve;
      }),
    );
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");
    const retry = retryMatterNameNow("node-1");

    let paused = false;
    const pause = pauseMatterNameRetry("node-1").then((resume) => {
      paused = true;
      return resume;
    });
    await settle();
    expect(paused).toBe(false);

    finishRetry(true);
    await retry;
    (await pause)();
    expect(paused).toBe(true);
  });

  it("forgets a name that a newer rename already wrote", async () => {
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");
    dropMatterNameRetry("node-1");

    await jest.advanceTimersByTimeAsync(200_000);
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it("forgets names when the user signs out", async () => {
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");
    await endUserSession();
    registerMatterNameRetryNodeLookup(() => current);

    await jest.advanceTimersByTimeAsync(200_000);
    expect(await retryMatterNameNow("node-1")).toBe(false);
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it("gives up a name kept in node metadata after the timed retries (another phone's rename is not seen live)", async () => {
    mockedCanRename.mockReturnValue(false);
    current = metadataNamedNode("Desk Lamp");
    queueMatterNameRetry(metadataNamedNode("Desk Lamp"), "Light", "Desk Lamp");

    await jest.advanceTimersByTimeAsync(120_000);
    mockedCanRename.mockReturnValue(true);
    expect(await retryMatterNameNow("node-1")).toBe(false);
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it("still writes a metadata-kept name within the timed retries", async () => {
    current = metadataNamedNode("Desk Lamp");
    queueMatterNameRetry(metadataNamedNode("Desk Lamp"), "Light", "Desk Lamp");

    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockedWrite).toHaveBeenCalledWith(current, "Desk Lamp");
  });

  it("keeps a name-param name waiting after the timed retries, for the device to be found", async () => {
    mockedCanRename.mockReturnValue(false);
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");

    await jest.advanceTimersByTimeAsync(120_000);
    mockedCanRename.mockReturnValue(true);
    expect(await retryMatterNameNow("node-1")).toBe(true);
  });

  it("forgets the name of a node that was removed", async () => {
    queueMatterNameRetry(storeNode("Desk Lamp"), "Light", "Desk Lamp");
    current = undefined;
    await jest.advanceTimersByTimeAsync(10_000);

    current = storeNode("Desk Lamp");
    expect(await retryMatterNameNow("node-1")).toBe(false);
    expect(mockedWrite).not.toHaveBeenCalled();
  });
});
