/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// A home subscribing its nodes while the reconnect's full resubscribe runs.
import type { ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import type { ESPCDFSubscribeToNodeUpdatesRequestParams } from "@store";
import {
  clearRmneoMqttConnection,
  ensureRmneoMqttConnected,
  startRmneoMqttConnection,
} from "../utils/helpers/mqttConnectionHelpers";
import {
  subscribeRmneoUserToNodeUpdates,
  unsubscribeFromNodeUpdates,
  type RmneoNodeSubscriptionState,
} from "../utils/helpers/userHelpers";
import { Logger } from "../utils/logger";

let mockConnected = false;
const mockWire = new Set<string>();
const mockStoreNodes: { id: string; _raw: { nodeId: string } }[] = [];
const tick = () => new Promise((r) => setTimeout(r, 20));

jest.mock("@espressif/rainmaker-neo-base-sdk", () => ({
  extractNodeIdFromTopic: () => undefined,
  SubscriptionChannelIds: { MQTT: "mqtt" },
  ESPRMNeoBase: {
    subscriptionManager: {
      getAvailableChannelsForNode: () => [],
      subscribeToAllNodes: async (nodes: { nodeId: string }[]) => {
        for (const node of nodes) {
          if (node.nodeId === "stuck") {
            await new Promise(() => {});
          }
          await tick();
          if (mockConnected) mockWire.add(node.nodeId);
        }
      },
      unsubscribeFromNode: async (nodeId: string) => {
        await tick();
        mockWire.delete(nodeId);
      },
    },
  },
}));
const state: RmneoNodeSubscriptionState = new Map();
const mockCdfUser = {
  subscribeToNodeUpdates: (params: { nodeList: unknown[] }) =>
    subscribeRmneoUserToNodeUpdates(
      params as unknown as ESPCDFSubscribeToNodeUpdatesRequestParams,
      state,
    ),
  unsubscribeFromNodeUpdates: () => unsubscribeFromNodeUpdates(state),
};
jest.mock("@store", () => ({
  ESPCDF: {
    instance: {
      nodeStore: {
        get nodesList() {
          return [...mockStoreNodes];
        },
      },
      userStore: {
        get user() {
          return mockCdfUser;
        },
      },
    },
  },
}));
jest.mock("@shared/utils/common", () => ({
  delay: (ms: number) => new Promise((r) => setTimeout(r, ms)),
}));
jest.mock("@shared/utils/constants", () => ({
  APP_STATE_ACTIVE: "active",
  APP_STATE_BACKGROUND: "background",
  APP_STATE_INACTIVE: "inactive",
  STATUS_SUCCESS: "success",
}));
jest.mock("@native-adaptors/implementations/ESPMQTTAdapter", () => ({
  addMqttMessageHook: jest.fn(),
  addMqttConnectionListener: () => () => {},
  allowMqttConnects: () => {},
  refuseMqttConnects: async () => {},
  ESPMQTTAdapter: {
    isConnected: async () => mockConnected,
    disconnect: async () => {},
  },
}));
jest.mock("@native-adaptors/utils/internetBack", () => ({
  onInternetBack: () => () => {},
}));
jest.mock("@native-adaptors/implementations/ESPMatterSubscriptionAdapter", () => ({
  isMatterSubscriptionLive: () => false,
}));
jest.mock("../utils/helpers/cdfStoreSinkHelpers", () => ({
  bindRmneoCdfStoreSink: jest.fn(),
  isServedByAnotherChannel: () => false,
  projectShadowDocumentToCdf: jest.fn(),
  projectRmneoUpdateToCdf: jest.fn(),
}));
jest.mock("../utils/helpers/groupHelpers", () => {
  const sdk = jest.requireMock("@espressif/rainmaker-neo-base-sdk");
  return {
    resetMqttNodeRegistrations: async (ids: string[]) => {
      await Promise.allSettled(
        ids.map((id) => sdk.ESPRMNeoBase.subscriptionManager.unsubscribeFromNode(id)),
      );
    },
  };
});
jest.mock("@shared/state/mqttTransportUiState", () => ({
  mqttTransportUiState: { setConnected: jest.fn() },
}));
jest.mock("../transformers/transformToESPCDFProvisioningDevice", () => ({}));
jest.mock("../transformers/transformToESPCDFNode", () => ({}));
jest.mock("../utils/matter/rearmMatterNodeInstance", () => ({}));
jest.mock("../utils/logger", () => ({
  Logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../utils/helpers/bleFilterHelpers", () => ({}));
jest.mock("../utils/helpers/nodeHelpers", () => ({}));
jest.mock("../utils/helpers/sharedHelpers", () => ({}));
jest.mock("@shared/utils/subscriptionHelper", () => ({}));
jest.mock("../utils/helpers/pushIntegrationHelpers", () => ({}));

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("home-load subscribe racing the reconnect resubscribe keeps every node on the wire", async () => {
  jest.useFakeTimers();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  let finish = () => {};
  const user = {
    connectMQTT: () =>
      new Promise((resolve) => {
        finish = () => {
          mockConnected = true;
          resolve(true);
        };
      }),
  } as unknown as ESPRMNeoUser;

  // Selected home: loaded and "subscribed" while MQTT was still down.
  const homeA = ["a1", "a2", "a3"].map((id) => ({ id, _raw: { nodeId: id } }));
  mockStoreNodes.push(...homeA);
  void startRmneoMqttConnection(user);
  // groupSync after its 4 s wait: fire-and-forget ensure.
  const ensured = ensureRmneoMqttConnected(user);
  const homeASub = mockCdfUser.subscribeToNodeUpdates({ nodeList: homeA });
  await jest.advanceTimersByTimeAsync(100);
  await homeASub;
  expect(mockWire.size).toBe(0);
  expect(state.size).toBe(3);

  // MQTT comes up while a second home is still loading.
  finish();
  await jest.advanceTimersByTimeAsync(10);
  const homeB = ["b1", "b2"].map((id) => ({ id, _raw: { nodeId: id } }));
  mockStoreNodes.push(...homeB);
  const homeBSub = mockCdfUser.subscribeToNodeUpdates({ nodeList: homeB });

  await jest.advanceTimersByTimeAsync(2000);
  await Promise.all([ensured, homeBSub]);
  clearRmneoMqttConnection(user);
  jest.useRealTimers();
  expect([...mockWire].sort()).toEqual(["a1", "a2", "a3", "b1", "b2"]);
});

it("lets the next subscribe start beside one that never finishes, with a warning", async () => {
  jest.useFakeTimers();
  mockConnected = true;
  const ownState: RmneoNodeSubscriptionState = new Map();
  const subscribe = (nodeId: string) =>
    subscribeRmneoUserToNodeUpdates(
      {
        nodeList: [{ id: nodeId, _raw: { nodeId } }],
      } as unknown as ESPCDFSubscribeToNodeUpdatesRequestParams,
      ownState,
    );
  void subscribe("stuck");
  const next = subscribe("n1");

  await jest.advanceTimersByTimeAsync(59_000);
  expect(mockWire.has("n1")).toBe(false);
  expect(Logger.warn).not.toHaveBeenCalledWith(
    expect.stringContaining("still running"),
  );

  await jest.advanceTimersByTimeAsync(1_100);
  await next;
  expect(mockWire.has("n1")).toBe(true);
  expect(Logger.warn).toHaveBeenCalledWith(
    expect.stringContaining("still running after 60 s"),
  );
});
