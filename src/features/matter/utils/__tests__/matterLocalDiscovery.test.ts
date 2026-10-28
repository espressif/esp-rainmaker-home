/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceEventEmitter } from "react-native";
import type { ESPCDF } from "@store";
import { endUserSession } from "@shared/utils/userSession";
import { startMatterLocalDiscovery } from "../matterLocalDiscovery";
import { bootstrapMatterFabricForOperationalDiscovery } from "@features/matter/utils/matterCommissioningHelpers";
import { syncMatterDiscoveryTargetNodeIds } from "@native-adaptors/implementations/matterDiscoveryTargets";
import {
  registerMatterNameRetryNodeLookup,
  retryMatterNameNow,
} from "@shared/utils/matterNameRetry";

const MATTER_EVENT = "com.espressif.event.matterLocalDiscovery";
const mockHandleNodeTransportUpdate = jest.fn();

// The real constants module needs the app's region config, absent in tests.
jest.mock("@shared/utils/constants", () => ({
  MATTER_LOCAL_DISCOVERY_EVENT: "com.espressif.event.matterLocalDiscovery",
  MATTER_LOCAL_DISCOVERY_LOST_EVENT: "com.espressif.event.matterLocalDiscoveryLost",
  MATTER_LOCAL_TRANSPORT_KEY: "matter_local",
  MATTER_METADATA_NODE_ID_KEY: "matter_node_id",
  DISCOVERY_UPDATE_EVENT: "DiscoveryUpdate",
  DISCOVERY_LOST_EVENT: "DiscoveryLost",
  MDNS_SERVICE_TYPE_MATTER_OPERATIONAL: "_matter._tcp.",
  MDNS_DOMAIN_LOCAL: "local.",
}));
jest.mock("@store", () => ({
  ESPCDF: { instance: null },
  ESPCDFNode: class {},
  handleNodeTransportUpdate: (...args: unknown[]) =>
    mockHandleNodeTransportUpdate(...args),
}));
jest.mock("@native-adaptors/implementations/matterDiscoveryTargets", () => ({
  syncMatterDiscoveryTargetNodeIds: jest.fn(),
}));
const mockLinkLiveListeners = new Set<(nodeId: string) => void>();
jest.mock("@native-adaptors/implementations/ESPMatterSubscriptionAdapter", () => ({
  syncMatterNodeIdMappings: jest.fn(),
  setMatterNodeReachability: jest.fn(),
  onMatterLinkLive: (listener: (nodeId: string) => void) => {
    mockLinkLiveListeners.add(listener);
    return () => mockLinkLiveListeners.delete(listener);
  },
}));
jest.mock("@features/matter/utils/matterCommissioningHelpers", () => ({
  bootstrapMatterFabricForOperationalDiscovery: jest.fn(async () => {}),
}));
jest.mock("@shared/utils/matterSubscribeRetry", () => ({
  retrySubscribeForNodeId: jest.fn(async () => {}),
}));
jest.mock("@shared/utils/matterDeviceStateEvents", () => ({
  readMatterNodeIdFromCdfNode: (node: { metadata?: { matter_node_id?: string } }) =>
    node.metadata?.matter_node_id,
}));
jest.mock("@shared/utils/matterLocalStorage", () => ({
  getMatterMetadata: jest.fn(async () => null),
  setMatterMetadata: jest.fn(async () => {}),
}));
jest.mock("@shared/utils/matterAttributeRead", () => ({
  readAttributesForNodeId: jest.fn(async () => {}),
}));
jest.mock("@shared/utils/matterNameRetry", () => ({
  registerMatterNameRetryNodeLookup: jest.fn(() => jest.fn()),
  retryMatterNameNow: jest.fn(async () => false),
}));

const advertisement = {
  matterNodeId: "0000000000000A06",
  host: "10.0.0.5",
  port: 5540,
};

/** A fake signed-in store with one Matter light in a Matter home. */
function makeStore() {
  const sdkCallbacks: Record<string, (event: unknown) => void> = {};
  const user = {
    subscribeToEvent: jest.fn(
      async (event: string, callback: (event: unknown) => void) => {
        sdkCallbacks[event] = callback;
      },
    ),
    unsubscribeFromEvent: jest.fn(async (event: string) => {
      delete sdkCallbacks[event];
    }),
  };
  const light = {
    id: "light",
    isMatter: true,
    metadata: { matter_node_id: advertisement.matterNodeId },
  };
  const home = { id: "home", isMatter: true, nodeDetails: [light] };
  const store = {
    getCurrentHome: () => home,
    getNodesForCurrentHome: () => [light],
    userStore: { user },
    nodeStore: {
      getNodeById: (id: string) => (id === light.id ? light : undefined),
    },
  } as unknown as ESPCDF;
  return { store, user, sdkCallbacks };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

describe("startMatterLocalDiscovery", () => {
  beforeEach(async () => {
    await endUserSession();
    mockHandleNodeTransportUpdate.mockClear();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("handles one advertisement once even when both listeners deliver it", async () => {
    const { store, sdkCallbacks } = makeStore();
    startMatterLocalDiscovery(store);
    await settle();

    DeviceEventEmitter.emit("DiscoveryUpdate", advertisement);
    sdkCallbacks[MATTER_EVENT]?.(advertisement);

    expect(mockHandleNodeTransportUpdate).toHaveBeenCalledTimes(1);
  });

  it("retries a device name the device missed once it is found on the local network", async () => {
    const { store } = makeStore();
    startMatterLocalDiscovery(store);
    await settle();
    (retryMatterNameNow as jest.Mock).mockClear();

    DeviceEventEmitter.emit("DiscoveryUpdate", advertisement);
    await settle();

    expect(retryMatterNameNow).toHaveBeenCalledWith("light");
  });

  it("retries a missed device name when the device's Matter link comes up, and finds nodes in the store", async () => {
    const { store } = makeStore();
    startMatterLocalDiscovery(store);
    await settle();
    (retryMatterNameNow as jest.Mock).mockClear();

    mockLinkLiveListeners.forEach((listener) => listener("light"));
    expect(retryMatterNameNow).toHaveBeenCalledWith("light");

    const lookup = (registerMatterNameRetryNodeLookup as jest.Mock).mock
      .calls[0][0] as (id: string) => unknown;
    expect(lookup("light")).toEqual(expect.objectContaining({ id: "light" }));
  });

  it("maps the Matter id Neo subscribes under to the node, so its link coming up also retries", async () => {
    const { store } = makeStore();
    startMatterLocalDiscovery(store);
    await settle();
    (retryMatterNameNow as jest.Mock).mockClear();

    mockLinkLiveListeners.forEach((listener) =>
      listener(advertisement.matterNodeId),
    );
    expect(retryMatterNameNow).toHaveBeenCalledWith("light");

    (retryMatterNameNow as jest.Mock).mockClear();
    mockLinkLiveListeners.forEach((listener) => listener("FFFFFFFFFFFFFFFF"));
    expect(retryMatterNameNow).not.toHaveBeenCalled();
  });

  it("stops retrying names when the session ends", async () => {
    const { store } = makeStore();
    startMatterLocalDiscovery(store);
    await settle();

    await endUserSession();

    expect(mockLinkLiveListeners.size).toBe(0);
  });

  it("stops listening when the session ends", async () => {
    const { store, user } = makeStore();
    startMatterLocalDiscovery(store);
    await settle();

    await endUserSession();
    DeviceEventEmitter.emit("DiscoveryUpdate", advertisement);

    expect(user.unsubscribeFromEvent).toHaveBeenCalled();
    expect(mockHandleNodeTransportUpdate).not.toHaveBeenCalled();
  });

  it("starts fresh for the next session instead of reusing the old one", async () => {
    const first = makeStore();
    startMatterLocalDiscovery(first.store);
    await settle();
    await endUserSession();

    const second = makeStore();
    startMatterLocalDiscovery(second.store);
    await settle();
    DeviceEventEmitter.emit("DiscoveryUpdate", advertisement);

    expect(second.user.subscribeToEvent).toHaveBeenCalledWith(
      MATTER_EVENT,
      expect.any(Function),
    );
    expect(mockHandleNodeTransportUpdate).toHaveBeenCalledWith(
      second.store,
      "light",
      expect.objectContaining({ type: "matter_local" }),
      "add",
    );
  });

  it("starts fresh when a different user signs in on the same store", async () => {
    const first = makeStore();
    startMatterLocalDiscovery(first.store);
    await settle();

    const nextUser = makeStore().user;
    (first.store as unknown as { userStore: { user: unknown } }).userStore.user =
      nextUser;
    startMatterLocalDiscovery(first.store);
    await settle();

    expect(first.user.unsubscribeFromEvent).toHaveBeenCalled();
    expect(nextUser.subscribeToEvent).toHaveBeenCalledWith(
      MATTER_EVENT,
      expect.any(Function),
    );
  });

  it("pushes nothing to native when setup finishes after logout", async () => {
    let finishSetup!: () => void;
    (bootstrapMatterFabricForOperationalDiscovery as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSetup = resolve;
        }),
    );
    const { store } = makeStore();
    startMatterLocalDiscovery(store);
    await settle();
    const pushTargets = syncMatterDiscoveryTargetNodeIds as jest.Mock;
    pushTargets.mockClear();

    const startedAt = Date.now();
    const ending = endUserSession();
    await settle(); // stop has begun and is waiting for the setup
    finishSetup();
    await ending;

    // Stop waited for the setup (not its full time limit), and only its own
    // clear reached native: no targets for the session that ended.
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(pushTargets.mock.calls).toEqual([[[]]]);
  });

  it("never lets a controller made for an old store run against a new one", async () => {
    const first = makeStore();
    startMatterLocalDiscovery(first.store);
    await settle();

    const second = makeStore();
    startMatterLocalDiscovery(second.store);
    await settle();

    expect(first.user.unsubscribeFromEvent).toHaveBeenCalled();
    expect(second.user.subscribeToEvent).toHaveBeenCalled();
  });
});
