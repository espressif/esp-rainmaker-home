/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  allowMqttConnects,
  ESPMQTTAdapter,
  refuseMqttConnects,
} from "../ESPMQTTAdapter";

const mockNativeConnect = jest.fn();
const mockNativeDisconnect = jest.fn(async () => null);

// The adapter reads the native module when it loads, so it goes in first.
jest.mock("react-native", () => {
  const reactNative = jest.requireActual("react-native");
  reactNative.NativeModules.ESPMQTTModule = {
    connect: (...args: unknown[]) => mockNativeConnect(...args),
    disconnect: () => mockNativeDisconnect(),
    isConnected: async () => false,
    addListener: () => {},
    removeListeners: () => {},
  };
  return reactNative;
});

const CONFIG = {
  accessKey: "key",
  secretKey: "secret",
  sessionToken: "token",
  endpoint: "mqtt.example.com",
  clientId: "user:test:000001",
};

describe("ESPMQTTAdapter.connect", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockNativeConnect.mockReset();
    mockNativeDisconnect.mockClear();
    allowMqttConnects();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("gives up on a native connect that never answers and ends it", async () => {
    mockNativeConnect.mockReturnValue(new Promise(() => {}));
    const connect = ESPMQTTAdapter.connect(CONFIG);
    const outcome = expect(connect).rejects.toThrow(
      "Native MQTT connect gave no answer",
    );

    await jest.advanceTimersByTimeAsync(19_000);
    expect(mockNativeDisconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_000);
    await outcome;
    expect(mockNativeDisconnect).toHaveBeenCalledTimes(1);
  });

  it("passes a native failure straight on without ending anything", async () => {
    mockNativeConnect.mockRejectedValue(new Error("connection_failed"));

    await expect(ESPMQTTAdapter.connect(CONFIG)).rejects.toThrow(
      "connection_failed",
    );
    expect(mockNativeDisconnect).not.toHaveBeenCalled();
  });

  it("refuses connects after sign-out until the next session starts", async () => {
    mockNativeConnect.mockResolvedValue(null);
    await refuseMqttConnects();
    expect(mockNativeDisconnect).toHaveBeenCalledTimes(1);

    await expect(ESPMQTTAdapter.connect(CONFIG)).rejects.toThrow("signed out");
    expect(mockNativeConnect).not.toHaveBeenCalled();

    allowMqttConnects();
    await expect(ESPMQTTAdapter.connect(CONFIG)).resolves.toBeUndefined();
    expect(mockNativeConnect).toHaveBeenCalledTimes(1);
  });

  it("closes a connect that only finishes after sign-out", async () => {
    let finish = () => {};
    mockNativeConnect.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve(null);
      }),
    );
    const connect = ESPMQTTAdapter.connect(CONFIG);
    const outcome = expect(connect).rejects.toThrow("after sign-out");

    await refuseMqttConnects();
    finish();
    await outcome;
    // Once at sign-out, once more for what the late connect opened.
    expect(mockNativeDisconnect).toHaveBeenCalledTimes(2);
  });
});
