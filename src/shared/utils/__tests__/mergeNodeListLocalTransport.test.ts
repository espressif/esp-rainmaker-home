/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode, ESPCDFNodesByIDMap } from "@store";
import { mergeLocalTransportFromNodeMap } from "../mergeNodeListLocalTransport";

jest.mock("@store", () => ({ ESPCDFNodeTransport: { LOCAL: "local" } }));
jest.mock("@shared/utils/constants", () => ({
  MATTER_LOCAL_TRANSPORT_KEY: "matter_local",
}));

/** Stands in for an SDK node: its methods live on the class, not the object. */
class SdkNode {
  derivedConfig = { origin: { type: "derived" } };
  availableTransports: Record<string, unknown> = { mqtt: { type: "mqtt" } };
  getShadowName(): string {
    return "params-home";
  }
}

const LAN = { type: "matter_local", metadata: { host: "192.168.1.10" } };

describe("mergeLocalTransportFromNodeMap", () => {
  it("keeps the live SDK node, methods included, while carrying the LAN path", () => {
    const sdkNode = new SdkNode();
    const rebuilt = {
      id: "0000000000000A03",
      availableTransports: {},
      _raw: sdkNode,
    } as unknown as ESPCDFNode;
    const previous = {
      "0000000000000A03": { availableTransports: { matter_local: LAN } },
    } as unknown as ESPCDFNodesByIDMap;

    const [merged] = mergeLocalTransportFromNodeMap([rebuilt], previous);
    const raw = merged._raw as SdkNode;

    expect(raw).toBe(sdkNode);
    expect(raw.getShadowName()).toBe("params-home");
    expect(raw.availableTransports).toEqual({
      mqtt: { type: "mqtt" },
      matter_local: LAN,
    });
  });
});
