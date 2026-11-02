/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { projectShadowDocumentToCdf } from "../utils/helpers/cdfStoreSinkHelpers";
import { setCloudUpdateFilter } from "../utils/helpers/cloudUpdateFilter";
import { forwardRmneoUpdateAcceptedToCdfStore } from "../utils/helpers/mqttConnectionHelpers";

jest.mock("@espressif/rainmaker-neo-base-sdk", () => ({
  extractNodeIdFromTopic: (topic: string) => topic.split("/")[2],
}));
jest.mock("@store", () => ({ ESPCDF: { instance: null } }));
jest.mock("@shared/utils/common", () => ({ delay: jest.fn() }));
jest.mock("@shared/utils/constants", () => ({
  APP_STATE_ACTIVE: "active",
  APP_STATE_BACKGROUND: "background",
  APP_STATE_INACTIVE: "inactive",
}));
jest.mock("@native-adaptors/implementations/ESPMQTTAdapter", () => ({
  addMqttMessageHook: jest.fn(),
  addMqttConnectionListener: jest.fn(),
  ESPMQTTAdapter: {},
}));
jest.mock("../utils/helpers/cdfStoreSinkHelpers", () => ({
  bindRmneoCdfStoreSink: jest.fn(),
  projectShadowDocumentToCdf: jest.fn(),
}));
jest.mock("../utils/helpers/groupHelpers", () => ({
  resetMqttNodeRegistrations: jest.fn(),
}));
jest.mock("@shared/state/mqttTransportUiState", () => ({
  mqttTransportUiState: { setConnected: jest.fn() },
}));

const TOPIC = "$aws/things/hybrid/shadow/name/params-home/update/accepted";
const doc = { state: { reported: { params: { Light: { Power: true } } } } };

describe("forwardRmneoUpdateAcceptedToCdfStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setCloudUpdateFilter(undefined);
  });

  it("passes every cloud update when no filter is set", () => {
    forwardRmneoUpdateAcceptedToCdfStore(TOPIC, JSON.stringify(doc));

    expect(projectShadowDocumentToCdf).toHaveBeenCalledWith("hybrid", doc);
  });

  it("applies what the filter keeps", () => {
    const kept = {
      state: { reported: { params: { Light: { Name: "Hall" } } } },
    };
    setCloudUpdateFilter(() => kept);

    forwardRmneoUpdateAcceptedToCdfStore(TOPIC, JSON.stringify(doc));

    expect(projectShadowDocumentToCdf).toHaveBeenCalledWith("hybrid", kept);
  });

  it("drops what the filter drops", () => {
    setCloudUpdateFilter(() => null);

    forwardRmneoUpdateAcceptedToCdfStore(TOPIC, JSON.stringify(doc));

    expect(projectShadowDocumentToCdf).not.toHaveBeenCalled();
  });
});
