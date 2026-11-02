/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { reaction, runInAction } from "mobx";
import {
  ESPCDFDevice,
  ESPCDFDeviceParam,
  ESPCDFNode,
  makeEverythingObservable,
} from "@store";
import { getDeviceDisplayName } from "../deviceDisplayName";

jest.mock("../constants", () => ({
  ESPRM_NAME_PARAM_TYPE: "esp.param.name",
  ESPRM_PARAM_WRITE_PROPERTY: "write",
  MATTER_METADATA_KEY: "Matter",
  MATTER_METADATA_DEVICE_NAME_KEY: "deviceName",
}));

const EDITABLE = ["read", "write"];

function nameParam(value: unknown, properties: string[] = EDITABLE) {
  return { name: "Name", type: "esp.param.name", properties, value };
}

const powerParam = {
  name: "Power",
  type: "esp.param.power",
  properties: EDITABLE,
  value: true,
};

function savedMatterName(deviceName: string) {
  return { Matter: { deviceName } };
}

describe("getDeviceDisplayName", () => {
  it("classic RainMaker: the name param", () => {
    const device = {
      name: "Light",
      displayName: "Light",
      params: [nameParam("Bedroom Lamp"), powerParam],
    };
    expect(getDeviceDisplayName(device)).toBe("Bedroom Lamp");
  });

  it("classic RainMaker + Matter: a rename beats the name from setup", () => {
    const device = {
      name: "Light",
      displayName: "Light",
      params: [nameParam("Desk Lamp"), powerParam],
    };
    const node = { metadata: savedMatterName("Light") };
    expect(getDeviceDisplayName(device, node)).toBe("Desk Lamp");
  });

  it("classic pure Matter: the Matter name saved on the node", () => {
    // The SDK name is a copy taken when the node was built, so it goes stale.
    const device = { name: "0x1", displayName: "Light", params: [powerParam] };
    const node = { metadata: savedMatterName("Porch Light") };
    expect(getDeviceDisplayName(device, node)).toBe("Porch Light");
  });

  it("Neo RainMaker: the name param", () => {
    const device = {
      name: "Fan",
      displayName: "Fan",
      params: [nameParam("Ceiling Fan")],
    };
    expect(getDeviceDisplayName(device)).toBe("Ceiling Fan");
  });

  it("Neo pure Matter light: its own Matter name beats the name from setup", () => {
    const device = {
      name: "Light-EP1",
      displayName: "Light",
      params: [powerParam, nameParam("Reading Lamp")],
    };
    const node = { metadata: savedMatterName("Light") };
    expect(getDeviceDisplayName(device, node)).toBe("Reading Lamp");
  });

  it("Neo pure Matter light: the name from setup fills in until the light reports", () => {
    const device = {
      name: "Light-EP1",
      displayName: "Light",
      params: [powerParam, nameParam(undefined)],
    };
    const node = { metadata: savedMatterName("Light") };
    expect(getDeviceDisplayName(device, node)).toBe("Light");
  });

  it("Neo RainMaker + Matter: the name param", () => {
    const device = {
      name: "Light",
      displayName: "Light",
      params: [nameParam("Hall Light")],
    };
    const node = { metadata: { matter_node_id: "AB12" } };
    expect(getDeviceDisplayName(device, node)).toBe("Hall Light");
  });

  it("a fixed name param loses to the Matter name a rename writes", () => {
    const device = {
      name: "Light",
      params: [nameParam("Light", ["read"])],
    };
    const node = { metadata: savedMatterName("Study Lamp") };
    expect(getDeviceDisplayName(device, node)).toBe("Study Lamp");
  });

  it("classic pure Matter with several endpoints: every card shows the node name", () => {
    const second = {
      name: "0x2",
      displayName: "Endpoint 0x2",
      params: [powerParam],
    };
    const node = {
      devices: [{ name: "0x1" }, second],
      metadata: savedMatterName("Desk Strip"),
      sharesNodeName: true,
    };
    expect(getDeviceDisplayName(second, node)).toBe("Desk Strip");
  });

  it("Neo pure Matter with several endpoints: each endpoint keeps its own name", () => {
    const second = {
      name: "0x2",
      displayName: "Endpoint 0x2",
      params: [powerParam],
    };
    const node = {
      devices: [{ name: "0x1" }, second],
      metadata: savedMatterName("Desk Strip"),
    };
    expect(getDeviceDisplayName(second, node)).toBe("Endpoint 0x2");
  });

  it("classic RainMaker + Matter with several devices: fixed name params win", () => {
    const fan = { name: "Fan", params: [nameParam("Ceiling Fan", ["read"])] };
    const node = {
      devices: [{ name: "Light" }, fan],
      metadata: savedMatterName("Light and Fan"),
    };
    expect(getDeviceDisplayName(fan, node)).toBe("Ceiling Fan");
  });

  it("falls back to the internal name, then the node's own name", () => {
    expect(getDeviceDisplayName({ name: "Switch", params: [] })).toBe("Switch");
    expect(
      getDeviceDisplayName(
        { name: "", params: [nameParam("  ")] },
        { nodeConfig: { info: { name: "Node Label" } } },
      ),
    ).toBe("Node Label");
    expect(getDeviceDisplayName(undefined)).toBe("");
  });
});

/** A store node built the way the node store builds it. */
function storeNode(
  params: object[],
  metadata?: Record<string, unknown>,
): ESPCDFNode {
  const device = new ESPCDFDevice({
    name: "Light-EP1",
    type: "esp.device.lightbulb",
    displayName: "Light",
    params: params as ESPCDFDeviceParam[],
    operations: { getParams: async () => [] },
  } as unknown as ESPCDFDevice);
  const node = new ESPCDFNode({
    id: "0000000000000A04",
    devices: [device],
    metadata,
    operations: {},
  } as unknown as ESPCDFNode);
  return makeEverythingObservable(node, new Set(["_raw", "operations"]));
}

/** Records every name a screen reading through the resolver would show. */
function watchName(node: ESPCDFNode): string[] {
  const shown: string[] = [];
  reaction(
    () => getDeviceDisplayName(node.devices?.[0], node),
    (name) => shown.push(name),
  );
  return shown;
}

describe("live name changes", () => {
  it("follows a name the light reports after the screen drew", () => {
    const node = storeNode([powerParam, nameParam(undefined)], {
      Matter: { deviceName: "Light" },
    });
    const shown = watchName(node);

    runInAction(() => {
      node.devices![0].params[1].value = "Reading Lamp";
    });

    expect(shown).toEqual(["Reading Lamp"]);
  });

  it("follows a classic pure Matter rename saved on the node", () => {
    const node = storeNode([powerParam], savedMatterName("Light"));
    const shown = watchName(node);

    runInAction(() => {
      node.metadata = savedMatterName("Porch Light");
    });

    expect(shown).toEqual(["Porch Light"]);
  });
});
