/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { projectRmneoUpdateToCdf } from "../utils/helpers/cdfStoreSinkHelpers";
import {
  clearParamDeliveries,
  wasParamDeliveredWithin,
} from "../utils/helpers/paramDeliveryHelpers";

jest.mock("@espressif/rainmaker-neo-base-sdk", () => ({
  ESPRMNeoBase: {},
  SubscriptionChannelIds: { MQTT: "mqtt" },
}));
jest.mock("@store", () => ({ ESPCDF: { instance: null } }));
jest.mock("@shared/utils/subscriptionHelper", () => ({
  mapNodeUpdateDataToEvent: (update: unknown) => update,
}));
jest.mock("../utils/constants", () => ({}));
jest.mock("../utils/logger", () => ({ Logger: { warn: jest.fn() } }));
jest.mock("../utils/helpers/nodeHelpers", () => ({}));
jest.mock("../utils/helpers/sharedHelpers", () => ({}));

/** An update as a subscription channel hands it over. */
const plugUpdate = (source: string) => ({
  nodeId: "node-1",
  source,
  eventType: "rmaker.event.node_params_changed",
  payload: { Plug: { Power: false } },
});

describe("projectRmneoUpdateToCdf delivery notes", () => {
  beforeEach(() => {
    clearParamDeliveries();
  });

  it("notes params a live channel delivered to the store", () => {
    const listen = jest.fn();

    projectRmneoUpdateToCdf(plugUpdate("matter"), listen);

    expect(listen).toHaveBeenCalledTimes(1);
    expect(wasParamDeliveredWithin("node-1", "Plug", "Power", 5_000)).toBe(true);
  });

  it("does not note params the cloud delivered", () => {
    const listen = jest.fn();

    projectRmneoUpdateToCdf(plugUpdate("mqtt"), listen);

    expect(listen).toHaveBeenCalledTimes(1);
    expect(wasParamDeliveredWithin("node-1", "Plug", "Power", 5_000)).toBe(false);
  });
});
