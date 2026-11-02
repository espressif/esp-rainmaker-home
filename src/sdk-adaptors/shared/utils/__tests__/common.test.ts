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
import { getDeviceDisplayName } from "@shared/utils/deviceDisplayName";
import {
  keepLastKnownParamValues,
  makeCdfNodeParamsObservable,
  syncCdfNodeDisplayNames,
} from "../common";

jest.mock("@shared/utils/constants", () => ({
  ESPRM_NAME_PARAM_TYPE: "esp.param.name",
  ESPRM_PARAM_WRITE_PROPERTY: "write",
  MATTER_METADATA_KEY: "Matter",
  MATTER_METADATA_DEVICE_NAME_KEY: "deviceName",
}));

function nameParam(value: unknown) {
  return {
    name: "Name",
    type: "esp.param.name",
    properties: ["read", "write"],
    value,
  };
}

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

describe("adaptor helpers that keep names live", () => {
  it("a refresh that swaps in new params keeps the screen following", () => {
    const node = storeNode([nameParam("Light")]);
    const shown: string[] = [];
    reaction(
      () => getDeviceDisplayName(node.devices?.[0], node),
      (name) => shown.push(name),
    );
    const fetched = [
      new ESPCDFDeviceParam(nameParam("Hall Light") as ESPCDFDeviceParam),
    ];
    // What a device refresh does before handing the params to the store.
    makeCdfNodeParamsObservable({ devices: [{ params: fetched }] });

    // What the node store then does with them.
    runInAction(() => {
      node.devices![0].params = fetched;
    });
    runInAction(() => {
      fetched[0].value = "Kitchen Light";
    });

    expect(shown).toEqual(["Hall Light", "Kitchen Light"]);
  });

  it("keeps a reported name when a home sync rebuilds the node", () => {
    const setupName = { Matter: { deviceName: "Light" } };
    const before = storeNode([nameParam("Reading Lamp")], setupName);
    // The rebuilt light comes from its cloud config, which holds no values.
    const rebuilt = storeNode([nameParam(undefined)], setupName);

    keepLastKnownParamValues(rebuilt.devices ?? [], before.devices);

    expect(getDeviceDisplayName(rebuilt.devices?.[0], rebuilt)).toBe(
      "Reading Lamp",
    );
  });

  it("does not let an old value hide a fresh one", () => {
    const before = storeNode([nameParam("Old Name")]);
    const rebuilt = storeNode([nameParam("New Name")]);

    keepLastKnownParamValues(rebuilt.devices ?? [], before.devices);

    expect(getDeviceDisplayName(rebuilt.devices?.[0], rebuilt)).toBe(
      "New Name",
    );
  });

  it("stores the same name for screens that read displayName", () => {
    const node = storeNode([nameParam("Desk Lamp")], {
      Matter: { deviceName: "Light" },
    });

    syncCdfNodeDisplayNames(node);

    expect(node.devices?.[0].displayName).toBe("Desk Lamp");
  });
});
