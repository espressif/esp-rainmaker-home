/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { Logger } from "../utils/logger";
import { ESPRMNEO_USER_LOG_CLOUD_WRITE_REGISTER_FAILED } from "../utils/constants";
import {
  subscribeRmneoUserToNodeUpdates,
  type RmneoNodeSubscriptionState,
} from "../utils/helpers/userHelpers";

interface FakeNode {
  nodeId: string;
  isMatter?: boolean;
  /** A RainMaker + Matter node the phone can reach on the home network. */
  onHomeNetwork?: boolean;
}

/** Nodes the cloud channel registered, like the SDK's MQTT node registry. */
const mockCloudRegistry = new Set<string>();

const mockCloudChannel = {
  channelId: "mqtt",
  supportsNode: () => true,
  subscribe: jest.fn(async (_callback: unknown, node: FakeNode) => {
    mockCloudRegistry.add(node.nodeId);
  }),
};
const mockMatterChannel = {
  channelId: "matter",
  supportsNode: (node: FakeNode) =>
    node.isMatter === true || node.onHomeNetwork === true,
  subscribe: jest.fn(async () => {}),
};

jest.mock("@espressif/rainmaker-neo-base-sdk", () => {
  const availableChannels = (node: FakeNode) =>
    [mockMatterChannel, mockCloudChannel].filter((channel) =>
      channel.supportsNode(node),
    );
  return {
    SubscriptionChannelIds: { MQTT: "mqtt" },
    ESPRMNeoBase: {
      subscriptionManager: {
        getAvailableChannelsForNode: availableChannels,
        // Like the SDK: only the first channel that takes a node subscribes it.
        subscribeToAllNodes: async (
          nodes: FakeNode[],
          callback: (update: unknown) => void,
        ) => {
          for (const node of nodes) {
            await availableChannels(node)[0]?.subscribe(callback, node);
          }
        },
      },
    },
  };
});
jest.mock("@store", () => ({}));
jest.mock("@shared/utils/constants", () => ({ STATUS_SUCCESS: "success" }));
jest.mock("../transformers/transformToESPCDFProvisioningDevice", () => ({}));
jest.mock("../transformers/transformToESPCDFNode", () => ({}));
jest.mock("../utils/matter/rearmMatterNodeInstance", () => ({}));
jest.mock("../utils/logger", () => ({
  Logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../utils/helpers/bleFilterHelpers", () => ({}));
jest.mock("../utils/helpers/cdfStoreSinkHelpers", () => ({
  ...jest.requireActual("../utils/helpers/cdfStoreSinkHelpers"),
  projectRmneoUpdateToCdf: jest.fn(),
}));
jest.mock("../utils/helpers/nodeHelpers", () => ({}));
jest.mock("../utils/helpers/sharedHelpers", () => ({}));
jest.mock("@shared/utils/subscriptionHelper", () => ({}));
jest.mock("../utils/helpers/groupHelpers", () => ({}));
jest.mock("../utils/helpers/pushIntegrationHelpers", () => ({}));

/** The SDK's cloud write: refuses a node the cloud channel never registered. */
async function cloudWrite(nodeId: string): Promise<void> {
  if (!mockCloudRegistry.has(nodeId)) {
    throw new Error(`Node ${nodeId} not registered`);
  }
}

/** Re-subscribes nodes the way a reconnect or a room change does. */
function resubscribe(...nodes: FakeNode[]) {
  return subscribeRmneoUserToNodeUpdates(
    {
      nodeList: nodes.map((node) => ({
        _raw: node,
      })) as unknown as ESPCDFNode[],
    },
    new Map() as RmneoNodeSubscriptionState,
  );
}

describe("subscribeRmneoUserToNodeUpdates", () => {
  beforeEach(() => {
    mockCloudRegistry.clear();
    jest.clearAllMocks();
  });

  it("keeps a RainMaker + Matter node on the home network open to cloud writes", async () => {
    const hybrid = {
      nodeId: "node-living-room",
      onHomeNetwork: true,
    };

    await resubscribe(hybrid);

    expect(mockMatterChannel.subscribe).toHaveBeenCalledTimes(1);
    await expect(cloudWrite(hybrid.nodeId)).resolves.toBeUndefined();
  });

  it("adds nothing for a node the cloud channel already serves", async () => {
    await resubscribe({ nodeId: "native-neo-light" });

    expect(mockCloudChannel.subscribe).toHaveBeenCalledTimes(1);
  });

  it("leaves a pure Matter node to the Matter SDK", async () => {
    await resubscribe({ nodeId: "0000000000000A03", isMatter: true });

    expect(mockCloudChannel.subscribe).not.toHaveBeenCalled();
  });

  it("logs its own warning when the cloud is down", async () => {
    mockCloudChannel.subscribe.mockRejectedValueOnce(
      new Error("MQTT not connected"),
    );

    await resubscribe({ nodeId: "hybrid", onHomeNetwork: true });

    expect(Logger.warn).toHaveBeenCalledWith(
      ESPRMNEO_USER_LOG_CLOUD_WRITE_REGISTER_FAILED,
      expect.objectContaining({ nodeId: "hybrid" }),
    );
  });
});
