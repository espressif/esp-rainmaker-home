/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceEventEmitter } from "react-native";
import { ESPMatterControlAdapter } from "../ESPMatterControlAdapter";

const mockNativeSubscribe = jest.fn();

// The adapter reads the native module when it loads, so it goes in first.
jest.mock("react-native", () => {
  const reactNative = jest.requireActual("react-native");
  reactNative.NativeModules.ESPMatterModule = {
    matterControlSubscribe: (...args: unknown[]) =>
      mockNativeSubscribe(...args),
    matterControlUnsubscribe: async () => ({ success: true }),
    matterControlShutdown: async () => ({ success: true }),
  };
  return reactNative;
});
jest.mock("@shared/utils/constants", () => ({
  MATTER_DATA_VALUE_TYPE_ARRAY: "Array",
  MATTER_DATA_VALUE_TYPE_BOOLEAN: "Boolean",
  MATTER_DATA_VALUE_TYPE_DOUBLE: "Double",
  MATTER_DATA_VALUE_TYPE_FLOAT: "Float",
  MATTER_DATA_VALUE_TYPE_NULL: "Null",
  MATTER_DATA_VALUE_TYPE_OCTET_STRING: "OctetString",
  MATTER_DATA_VALUE_TYPE_SIGNED_INTEGER: "SignedInteger",
  MATTER_DATA_VALUE_TYPE_STRUCTURE: "Structure",
  MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER: "UnsignedInteger",
  MATTER_DATA_VALUE_TYPE_UTF8_STRING: "UTF8String",
}));

const NODE = "aabbccdd11223344";

function emitLinkState(subscriptionId: string, state: string) {
  DeviceEventEmitter.emit("ESPMatter:subscriptionState", {
    matterNodeId: NODE,
    subscriptionId,
    state,
  });
}

describe("ESPMatterControlAdapter.subscribe link state", () => {
  it("passes on the state of its own link only", async () => {
    mockNativeSubscribe.mockResolvedValue({ subscriptionId: "sub-2" });
    const onLinkStateChange = jest.fn();

    const result = await ESPMatterControlAdapter.subscribe(
      NODE,
      [],
      jest.fn(),
      onLinkStateChange,
    );
    emitLinkState("sub-1", "established");
    emitLinkState("sub-2", "established");
    emitLinkState("sub-2", "resubscribing");

    expect(onLinkStateChange.mock.calls).toEqual([[true], [false]]);
    result.unsubscribe?.();
  });

  it("keeps a state that arrives before the handle", async () => {
    mockNativeSubscribe.mockImplementation(async () => {
      emitLinkState("sub-3", "established");
      return { subscriptionId: "sub-3" };
    });
    const onLinkStateChange = jest.fn();

    const result = await ESPMatterControlAdapter.subscribe(
      NODE,
      [],
      jest.fn(),
      onLinkStateChange,
    );

    expect(onLinkStateChange).toHaveBeenCalledWith(true);
    result.unsubscribe?.();
  });

  it("counts an alive report as live", async () => {
    mockNativeSubscribe.mockResolvedValue({ subscriptionId: "sub-5" });
    const onLinkStateChange = jest.fn();

    const result = await ESPMatterControlAdapter.subscribe(
      NODE,
      [],
      jest.fn(),
      onLinkStateChange,
    );
    emitLinkState("sub-5", "alive");

    expect(onLinkStateChange).toHaveBeenCalledWith(true);
    result.unsubscribe?.();
  });

  it("tells every open link it is down when Matter shuts down", async () => {
    mockNativeSubscribe.mockResolvedValue({ subscriptionId: "sub-6" });
    const onLinkStateChange = jest.fn();
    await ESPMatterControlAdapter.subscribe(
      NODE,
      [],
      jest.fn(),
      onLinkStateChange,
    );
    emitLinkState("sub-6", "established");

    await ESPMatterControlAdapter.shutdown?.();

    expect(onLinkStateChange.mock.calls).toEqual([[true], [false]]);
  });

  it("stops listening when native returns no handle", async () => {
    mockNativeSubscribe.mockResolvedValue({});
    const onLinkStateChange = jest.fn();

    await ESPMatterControlAdapter.subscribe(
      NODE,
      [],
      jest.fn(),
      onLinkStateChange,
    );
    emitLinkState("sub-7", "established");

    expect(onLinkStateChange).not.toHaveBeenCalled();
  });

  it("stops listening once unsubscribed", async () => {
    mockNativeSubscribe.mockResolvedValue({ subscriptionId: "sub-4" });
    const onLinkStateChange = jest.fn();

    const result = await ESPMatterControlAdapter.subscribe(
      NODE,
      [],
      jest.fn(),
      onLinkStateChange,
    );
    result.unsubscribe?.();
    emitLinkState("sub-4", "error");

    expect(onLinkStateChange).not.toHaveBeenCalled();
  });
});
