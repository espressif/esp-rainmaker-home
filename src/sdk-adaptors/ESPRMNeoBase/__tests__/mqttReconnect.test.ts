/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import { endUserSession } from "@shared/utils/userSession";
import {
  clearRmneoMqttConnection,
  ensureRmneoMqttConnected,
  startRmneoMqttConnection,
} from "../utils/helpers/mqttConnectionHelpers";

/** What the native MQTT client reports. */
let mockTransportConnected = false;
/** Native drops and connects, in the order they happened. */
const mockEvents: string[] = [];
const mockDisconnect = jest.fn(async () => {
  mockEvents.push("drop");
  mockTransportConnected = false;
});
/** Sign-out: ends the native client and refuses connects until the next sign-in. */
const mockRefuseConnects = jest.fn(async () => {
  mockTransportConnected = false;
});
/** MQTT message hooks the helpers registered. */
const mockMessageHooks: ((topic: string, message: string) => void)[] = [];
/** Native connection-status listeners the helpers registered. */
const mockStatusListeners: ((status: { connected: boolean }) => void)[] = [];
const mockCdfUser = {
  subscribeToNodeUpdates: jest.fn(async () => {}),
  unsubscribeFromNodeUpdates: jest.fn(async () => {}),
};
const mockSetConnected = jest.fn();

jest.mock("@espressif/rainmaker-neo-base-sdk", () => ({
  extractNodeIdFromTopic: (topic: string) => topic.split("/")[2],
}));
jest.mock("@store", () => ({
  ESPCDF: {
    instance: {
      nodeStore: { nodesList: [{ id: "light", _raw: undefined }] },
      get userStore() {
        return { user: mockCdfUser };
      },
    },
  },
}));
jest.mock("@shared/utils/common", () => ({
  delay: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}));
jest.mock("@shared/utils/constants", () => ({
  APP_STATE_ACTIVE: "active",
  APP_STATE_BACKGROUND: "background",
  APP_STATE_INACTIVE: "inactive",
}));
jest.mock("@native-adaptors/implementations/ESPMQTTAdapter", () => ({
  addMqttMessageHook: (hook: (topic: string, message: string) => void) => {
    mockMessageHooks.push(hook);
    return () => {};
  },
  addMqttConnectionListener: (
    listener: (status: { connected: boolean }) => void,
  ) => {
    mockStatusListeners.push(listener);
    return () => {};
  },
  allowMqttConnects: jest.fn(),
  refuseMqttConnects: () => mockRefuseConnects(),
  ESPMQTTAdapter: {
    isConnected: async () => mockTransportConnected,
    disconnect: () => mockDisconnect(),
  },
}));
/** Internet-back listeners the helpers registered. */
const mockInternetBackListeners = new Set<() => void>();
jest.mock("@native-adaptors/utils/internetBack", () => ({
  onInternetBack: (listener: () => void) => {
    mockInternetBackListeners.add(listener);
    return () => mockInternetBackListeners.delete(listener);
  },
}));
jest.mock(
  "@native-adaptors/implementations/ESPMatterSubscriptionAdapter",
  () => ({ isMatterSubscriptionLive: () => false }),
);
jest.mock("../utils/helpers/cdfStoreSinkHelpers", () => ({
  bindRmneoCdfStoreSink: jest.fn(),
  isServedByAnotherChannel: () => false,
  projectShadowDocumentToCdf: jest.fn(),
}));
jest.mock("../utils/helpers/groupHelpers", () => ({
  resetMqttNodeRegistrations: jest.fn(async () => {}),
}));
jest.mock("@shared/state/mqttTransportUiState", () => ({
  mqttTransportUiState: {
    setConnected: (connected: boolean) => mockSetConnected(connected),
  },
}));

/** How one `connectMQTT()` call ends. */
type Outcome = "fail" | "hang" | "ok";

/**
 * A Neo user whose `connectMQTT()` calls end as `outcomes` says, in order,
 * then as `afterwards`.
 */
function makeUser(outcomes: Outcome[], afterwards: Outcome = "fail") {
  const callTimes: number[] = [];
  const connectMQTT = jest.fn(() => {
    callTimes.push(Date.now());
    mockEvents.push("connect");
    const outcome = outcomes.shift() ?? afterwards;
    if (outcome === "ok") {
      mockTransportConnected = true;
      return Promise.resolve(true);
    }
    if (outcome === "hang") {
      return new Promise<boolean>(() => {});
    }
    return Promise.reject(new Error("Network request failed"));
  });
  const user = { connectMQTT } as unknown as ESPRMNeoUser;
  return { user, connectMQTT, outcomes, callTimes };
}

let users: ESPRMNeoUser[] = [];

/** Advances fake time and lets the promises it unblocks run. */
async function advance(ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockTransportConnected = false;
  mockEvents.length = 0;
  mockStatusListeners.length = 0;
  mockInternetBackListeners.clear();
  mockDisconnect.mockClear();
  mockRefuseConnects.mockClear();
  mockCdfUser.subscribeToNodeUpdates.mockClear();
  mockSetConnected.mockClear();
  users = [];
});

afterEach(() => {
  users.forEach(clearRmneoMqttConnection);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Makes a user and remembers it so its watchdog is stopped after the test. */
function setup(outcomes: Outcome[], afterwards?: Outcome) {
  const made = makeUser(outcomes, afterwards);
  users.push(made.user);
  return made;
}

describe("Neo MQTT reconnect", () => {
  it("lets the next reconnect run after a connect is rejected", async () => {
    const { user, connectMQTT, outcomes } = setup(["ok"]);
    await startRmneoMqttConnection(user);

    // Wi-Fi drops; the first connects after it is back are refused.
    mockTransportConnected = false;
    outcomes.push("fail", "fail", "fail");
    const firstTry = ensureRmneoMqttConnected(user);
    await advance(4_500);
    await expect(firstTry).resolves.toBeUndefined();
    expect(connectMQTT).toHaveBeenCalledTimes(4);
    // The stale native client is dropped first, so fresh credentials are used.
    expect(mockEvents).toEqual(["connect", "drop", "connect", "connect", "connect"]);

    outcomes.push("ok");
    await ensureRmneoMqttConnected(user);
    expect(connectMQTT).toHaveBeenCalledTimes(5);
    expect(mockTransportConnected).toBe(true);
    expect(mockCdfUser.subscribeToNodeUpdates).toHaveBeenCalledTimes(1);
  });

  it("gives up on a connect that never answers and tries again", async () => {
    const { user, connectMQTT } = setup(["hang", "ok"]);
    const started = startRmneoMqttConnection(user);

    await advance(39_000);
    expect(connectMQTT).toHaveBeenCalledTimes(1);

    // 40 s: the attempt is given up; 1.5 s later the retry connects.
    await advance(2_500);
    await started;
    expect(connectMQTT).toHaveBeenCalledTimes(2);
    // The native connect is bounded on its own, so it is not cut short here.
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(mockTransportConnected).toBe(true);
    expect(mockSetConnected).toHaveBeenLastCalledWith(true);
  });

  it("keeps retrying with growing waits capped at 20 s, then recovers", async () => {
    const { user, connectMQTT, outcomes, callTimes } = setup([], "fail");
    const start = Date.now();
    void startRmneoMqttConnection(user);

    await advance(150_000);
    // Each round is three attempts (0, 1.5 s, 4.5 s); rounds start at:
    const roundStarts = callTimes
      .filter((_, index) => index % 3 === 0)
      .map((time) => (time - start) / 1000);
    expect(roundStarts).toEqual([0, 9.5, 19, 33.5, 58, 82.5, 107, 131.5]);
    const rounds = roundStarts.length;
    expect(connectMQTT).toHaveBeenCalledTimes(rounds * 3);

    // Network back: the next round connects and the nodes are subscribed.
    outcomes.push("ok");
    await advance(25_000);
    expect(connectMQTT).toHaveBeenCalledTimes(rounds * 3 + 1);
    expect(mockTransportConnected).toBe(true);
    expect(mockCdfUser.subscribeToNodeUpdates).toHaveBeenCalledTimes(1);
    expect(mockSetConnected).toHaveBeenLastCalledWith(true);

    // Once up, the watchdog only checks; it does not connect again.
    await advance(60_000);
    expect(connectMQTT).toHaveBeenCalledTimes(rounds * 3 + 1);
  });

  it("runs one connect when many callers ask for it at once", async () => {
    const { user, connectMQTT } = setup(["ok"]);
    await startRmneoMqttConnection(user);
    mockTransportConnected = false;

    let finish = () => {};
    connectMQTT.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = () => {
            mockTransportConnected = true;
            resolve(true);
          };
        }),
    );
    const callers = [
      ensureRmneoMqttConnected(user),
      ensureRmneoMqttConnected(user),
    ];
    mockStatusListeners.forEach((listener) => listener({ connected: false }));
    // The watchdog's check lands while the reconnect is still running.
    await advance(15_000);
    expect(connectMQTT).toHaveBeenCalledTimes(2);

    finish();
    await Promise.all(callers);
    expect(connectMQTT).toHaveBeenCalledTimes(2);
    expect(mockCdfUser.subscribeToNodeUpdates).toHaveBeenCalledTimes(1);
  });

  it("joins the first connect when a reconnect is asked for meanwhile", async () => {
    const { user, connectMQTT } = setup([]);
    let finish = () => {};
    connectMQTT.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = () => {
            mockTransportConnected = true;
            resolve(true);
          };
        }),
    );
    const started = startRmneoMqttConnection(user);
    // The home load asks for MQTT while the sign-in connect still runs.
    const ensured = ensureRmneoMqttConnected(user);
    await advance(3_000);
    finish();
    await Promise.all([started, ensured]);

    expect(connectMQTT).toHaveBeenCalledTimes(1);
    // Nodes the home loaded meanwhile are subscribed once MQTT is up.
    expect(mockCdfUser.subscribeToNodeUpdates).toHaveBeenCalledTimes(1);
  });

  it("ends a connect still running when the user signs out", async () => {
    const { user, connectMQTT } = setup(["hang"]);
    void startRmneoMqttConnection(user);
    await advance(1_000);

    await endUserSession();
    clearRmneoMqttConnection(user);
    expect(mockRefuseConnects).toHaveBeenCalledTimes(1);

    await advance(120_000);
    expect(connectMQTT).toHaveBeenCalledTimes(1);
  });

  it("ends the native client at sign-out even after giving up on a stuck connect", async () => {
    const { user, connectMQTT } = setup(["hang", "hang", "hang"]);
    void startRmneoMqttConnection(user);
    // Three 40 s attempts with 1.5 s and 3 s between them: all given up.
    await advance(125_000);
    expect(connectMQTT).toHaveBeenCalledTimes(3);

    // The SDK calls may still be waiting on the network; sign-out ends the
    // native client anyway and refuses their connects.
    await endUserSession();
    clearRmneoMqttConnection(user);
    expect(mockRefuseConnects).toHaveBeenCalledTimes(1);
  });

  it("reconnects at once when the internet comes back instead of waiting", async () => {
    const { user, connectMQTT, outcomes, callTimes } = setup([], "fail");
    const start = Date.now();
    void startRmneoMqttConnection(user);
    // Rounds at 0, 9.5, 19 and 33.5 s fail; the next one would be at 58 s.
    await advance(40_000);
    expect(connectMQTT).toHaveBeenCalledTimes(12);

    outcomes.push("ok");
    mockInternetBackListeners.forEach((listener) => listener());
    await advance(0);
    expect(connectMQTT).toHaveBeenCalledTimes(13);
    expect((callTimes[12] - start) / 1000).toBe(40);
    expect(mockTransportConnected).toBe(true);
  });

  it("checks again at once when the internet comes back during a check", async () => {
    const { user, connectMQTT, outcomes, callTimes } = setup([], "fail");
    const start = Date.now();
    void startRmneoMqttConnection(user);
    // The watchdog's first round starts at 9.5 s (tries at 9.5, 11, 14 s).
    await advance(10_000);
    expect(connectMQTT).toHaveBeenCalledTimes(4);

    // The rest of that round still fails; the check right after it works.
    outcomes.push("fail", "fail", "ok");
    mockInternetBackListeners.forEach((listener) => listener());
    await advance(4_100);
    expect(connectMQTT).toHaveBeenCalledTimes(7);
    // Straight after the failed round at 14 s, not 5 s later.
    expect((callTimes[6] - start) / 1000).toBeCloseTo(14, 1);
    expect(mockTransportConnected).toBe(true);
  });

  it("does not reconnect on internet back after the user signs out", async () => {
    const { user, connectMQTT } = setup([], "fail");
    void startRmneoMqttConnection(user);
    await advance(20_000);
    const callsBeforeLogout = connectMQTT.mock.calls.length;

    await endUserSession();
    clearRmneoMqttConnection(user);
    mockInternetBackListeners.forEach((listener) => listener());
    await advance(60_000);
    expect(connectMQTT).toHaveBeenCalledTimes(callsBeforeLogout);
    expect(mockInternetBackListeners.size).toBe(0);
  });

  it("rebuilds a connected client that has been silent for over two keep-alives when the internet comes back", async () => {
    const { user, connectMQTT } = setup(["ok", "ok"]);
    await startRmneoMqttConnection(user);
    // Still "connected", but nothing arrived for 81 s (the socket died quietly).
    await advance(81_000);
    expect(connectMQTT).toHaveBeenCalledTimes(1);

    mockInternetBackListeners.forEach((listener) => listener());
    await advance(2_000);
    expect(mockDisconnect).toHaveBeenCalled();
    expect(connectMQTT).toHaveBeenCalledTimes(2);
    expect(mockTransportConnected).toBe(true);
  });

  it("leaves a connected client alone on internet back when a message arrived recently", async () => {
    const { user, connectMQTT } = setup(["ok"]);
    await startRmneoMqttConnection(user);
    await advance(70_000);
    mockMessageHooks.forEach((hook) => hook("topic", "{}"));
    await advance(11_000);

    mockInternetBackListeners.forEach((listener) => listener());
    await advance(2_000);
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(connectMQTT).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the user signs out", async () => {
    const { user, connectMQTT } = setup([], "fail");
    void startRmneoMqttConnection(user);
    await advance(10_000);
    const callsBeforeLogout = connectMQTT.mock.calls.length;

    await endUserSession();
    await advance(120_000);
    expect(connectMQTT).toHaveBeenCalledTimes(callsBeforeLogout);
  });
});
