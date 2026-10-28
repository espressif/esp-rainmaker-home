/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMNeoMatterBase } from "@espressif/rainmaker-neo-matter-sdk";
import { StartupError } from "@shared/utils/startupError";
import { ESPRMNeoMatterBaseSDKAdaptor } from "../index";

const mockSetGlobalChannelOrder = jest.fn();

jest.mock("@espressif/rainmaker-neo-base-sdk", () => ({
  ESPTransportMode: { local: "local", mqtt: "mqtt" },
  ESPRMNeoBase: {
    setTransportOrder: jest.fn(),
    getAuthInstance: jest.fn(() => ({})),
    subscriptionManager: {
      getGlobalChannelOrder: () => ["mqtt"],
      setGlobalChannelOrder: (ids: string[]) => mockSetGlobalChannelOrder(ids),
    },
  },
}));
jest.mock("@espressif/rainmaker-neo-matter-sdk", () => ({
  MatterSubscriptionChannelIds: { MATTER: "matter" },
  ESPRMNeoMatterBase: {
    configure: jest.fn(),
    initializeMatterSubscription: jest.fn(),
    getMatterSubscriptionChannel: jest.fn(() => ({
      setFabricIdResolver: jest.fn(),
      setLocalReachabilityResolver: jest.fn(),
    })),
  },
}));
jest.mock("@shared/utils/constants", () => ({ SUCESS: "success" }));
jest.mock("@native-adaptors/implementations/ESPMatterUtilityAdapter", () => ({
  getActiveMatterFabricId: () => "fabric",
}));
jest.mock("@shared/utils/matterLocalReachability", () => ({
  isMatterNodeLocallyReachable: () => true,
}));
jest.mock("@sdk-adaptors/ESPRMNeoBase", () => ({
  ESPRMNeoBaseSDKAdaptor: class {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  },
}));
jest.mock("../constants", () => ({ NEO_MATTER_DESC_SDK_INITIALIZED: "ready" }));
const mockSetCloudUpdateFilter = jest.fn();
jest.mock("@sdk-adaptors/ESPRMNeoBase/utils/helpers/cloudUpdateFilter", () => ({
  setCloudUpdateFilter: (filter: unknown) => mockSetCloudUpdateFilter(filter),
}));
jest.mock("../utils/matterDuplicateFilter", () => ({
  createMatterDuplicateFilter: (isLinkLive: unknown) => ({ isLinkLive }),
}));
jest.mock("../transformers/transformToESPCDFUser", () => ({
  transformToESPCDFUser: jest.fn(),
}));

const initializeMatterSubscription =
  ESPRMNeoMatterBase.initializeMatterSubscription as jest.Mock;

const makeAdaptor = () =>
  new ESPRMNeoMatterBaseSDKAdaptor({
    matterSubscriptionAdapter: {},
  } as never);

describe("ESPRMNeoMatterBaseSDKAdaptor.initializeSDK", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("puts the Matter channel first once it registers", async () => {
    initializeMatterSubscription.mockResolvedValue(undefined);

    await expect(makeAdaptor().initializeSDK()).resolves.toMatchObject({
      status: "success",
    });
    expect(mockSetGlobalChannelOrder).toHaveBeenCalledWith(["matter", "mqtt"]);
  });

  it("hands the cloud bridge a duplicate filter that asks the subscription adapter", async () => {
    initializeMatterSubscription.mockResolvedValue(undefined);
    const isLinkLive = jest.fn(() => true);
    const adaptor = new ESPRMNeoMatterBaseSDKAdaptor({
      matterSubscriptionAdapter: { isLinkLive },
    } as never);

    await adaptor.initializeSDK();
    // A filter from an earlier start is dropped first, then the new one set.
    expect(mockSetCloudUpdateFilter.mock.calls[0]).toEqual([undefined]);
    const [{ isLinkLive: askLink }] = mockSetCloudUpdateFilter.mock.calls.at(
      -1,
    ) as [{ isLinkLive: (...ids: string[]) => boolean }];

    expect(askLink("hybrid", "AABB")).toBe(true);
    expect(isLinkLive).toHaveBeenCalledWith("hybrid", "AABB");
  });

  it("stops app start when the Matter channel cannot register", async () => {
    initializeMatterSubscription.mockRejectedValue(new Error("no channel"));

    await expect(makeAdaptor().initializeSDK()).rejects.toBeInstanceOf(
      StartupError,
    );
    expect(mockSetGlobalChannelOrder).not.toHaveBeenCalled();
  });
});
