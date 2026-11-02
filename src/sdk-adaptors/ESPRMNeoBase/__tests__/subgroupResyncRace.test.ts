/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// A home subscribing its nodes while a room or control group change resyncs MQTT.
import type { ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import type { ESPCDFSubscribeToNodeUpdatesRequestParams } from "@store";
import { resyncMqttAfterSubgroupChange } from "../utils/helpers/groupHelpers";
import { applyRefreshedCdfNodeToStore } from "../utils/helpers/nodeHelpers";
import { rearmMatterNodeInstance } from "../utils/matter/rearmMatterNodeInstance";
import {
  subscribeRmneoUserToNodeUpdates,
  unsubscribeFromNodeUpdates,
  type RmneoNodeSubscriptionState,
} from "../utils/helpers/userHelpers";

/** Node ids subscribed at the broker. */
const mockWire = new Set<string>();
const mockStoreNodes: { id: string; _raw: { nodeId: string } }[] = [];
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

jest.mock("@espressif/rainmaker-neo-base-sdk", () => ({
  clearNcfgVersionMarker: jest.fn(),
  ESPRMNeoGroup: class {},
  ESPRMNeoNode: class {},
  ESPRMNeoSchedule: class {},
  SubscriptionChannelIds: { MQTT: "mqtt" },
  ESPRMNeoBase: {
    subscriptionManager: {
      getAvailableChannelsForNode: () => [],
      // Subscribing is quick; unsubscribing waits a moment per node.
      subscribeToAllNodes: async (nodes: { nodeId: string }[]) => {
        for (const node of nodes) {
          await Promise.resolve();
          mockWire.add(node.nodeId);
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
jest.mock("@shared/utils/constants", () => ({
  GROUP_CONTROL_PAYLOAD_PARAMS_ENVELOPE_KEY: "params",
  STATUS_SUCCESS: "success",
}));
jest.mock("@shared/utils/groupParamBroadcastEnvelope", () => ({}));
jest.mock("@config/sdk.identifiers", () => ({
  ESPRMNeoBaseAdaptorIdentifier: "ESPRMNeoBase",
}));
jest.mock("../utils/helpers/nodeHelpers", () => ({
  applyRefreshedCdfNodeToStore: jest.fn(),
  clearCdfProjectedNcfg: jest.fn(),
}));
jest.mock("../utils/helpers/sharedHelpers", () => ({}));
jest.mock("../transformers/transformToESPCDFNode", () => ({
  transformToESPCDFNode: (node: { nodeId: string }) => ({ id: node.nodeId }),
}));
jest.mock("../transformers/transformToESPCDFGroup", () => ({}));
jest.mock("../transformers/transformToESPCDFProvisioningDevice", () => ({}));
jest.mock("../utils/matter/rearmMatterNodeInstance", () => ({
  rearmMatterNodeInstance: jest.fn(async () => {}),
}));
jest.mock("../utils/logger", () => ({
  Logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../utils/helpers/bleFilterHelpers", () => ({}));
jest.mock("../utils/helpers/cdfStoreSinkHelpers", () => ({
  isServedByAnotherChannel: () => false,
  projectRmneoUpdateToCdf: jest.fn(),
}));
jest.mock("../utils/helpers/pushIntegrationHelpers", () => ({}));

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("a home subscribing during a room change resync keeps its nodes subscribed", async () => {
  jest.useFakeTimers();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const a1 = { id: "a1", _raw: { nodeId: "a1" } };
  mockStoreNodes.push(a1);
  await mockCdfUser.subscribeToNodeUpdates({ nodeList: [a1] });
  expect([...mockWire]).toEqual(["a1"]);

  // A room change moved a1 and b1; the groups fetch fails, so no node is
  // rebuilt and the final subscribe relies on what is registered.
  const user = {
    getGroups: async () => {
      throw new Error("offline");
    },
  } as unknown as ESPRMNeoUser;
  const resync = resyncMqttAfterSubgroupChange(user, ["a1", "b1"]);
  await jest.advanceTimersByTimeAsync(5);

  // Meanwhile a home finishes loading and subscribes b1.
  const b1 = { id: "b1", _raw: { nodeId: "b1" } };
  mockStoreNodes.push(b1);
  const homeSubscribe = mockCdfUser.subscribeToNodeUpdates({ nodeList: [b1] });

  await jest.advanceTimersByTimeAsync(1000);
  await Promise.all([resync, homeSubscribe]);
  expect([...mockWire].sort()).toEqual(["a1", "b1"]);
});

it("a room change gives a rebuilt node its Matter control back before the store takes it", async () => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  const rearm = rearmMatterNodeInstance as jest.Mock;
  const applyToStore = applyRefreshedCdfNodeToStore as jest.Mock;
  rearm.mockClear();
  applyToStore.mockClear();

  // The plug moved into a room: the resync rebuilds it from the cloud.
  const fresh = { nodeId: "plug" };
  const home = { nodeIds: ["plug"], getNode: async () => fresh };
  const user = { getGroups: async () => [home] } as unknown as ESPRMNeoUser;
  await resyncMqttAfterSubgroupChange(user, ["plug"]);

  expect(rearm).toHaveBeenCalledWith(fresh);
  expect(applyToStore).toHaveBeenCalledWith({ id: "plug" });
  expect(rearm.mock.invocationCallOrder[0]).toBeLessThan(
    applyToStore.mock.invocationCallOrder[0],
  );
});
