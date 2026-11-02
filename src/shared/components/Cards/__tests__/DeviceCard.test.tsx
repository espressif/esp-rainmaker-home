/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { observable, runInAction } from "mobx";
import type { ESPCDFDevice, ESPCDFNode } from "@store";
import DeviceCard from "../DeviceCard";

const mockStore = observable({
  nodeStore: { nodesByIDMap: {} as Record<string, unknown> },
  subscriptionStore: { registeredTransports: {} as Record<string, unknown> },
});
const mockShowError = jest.fn();

jest.mock("@shared/hooks/useCDF", () => ({
  useCDF: () => ({ store: mockStore }),
}));
jest.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ showError: mockShowError }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
// Stands in for the tamagui Switch: a tap asks for the opposite of what it shows.
jest.mock("tamagui", () => {
  const { createElement } = jest.requireActual("react");
  const { Pressable, View } = jest.requireActual("react-native");
  const Switch = (props: {
    testID?: string;
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (next: boolean) => void;
    children?: unknown;
  }) =>
    createElement(
      Pressable,
      {
        testID: props.testID,
        disabled: props.disabled,
        onPress: () => props.onCheckedChange?.(!props.checked),
      },
      props.children,
    );
  const Thumb = (props: { testID?: string }) =>
    createElement(View, { testID: props.testID });
  return { Switch: Object.assign(Switch, { Thumb }) };
});
jest.mock("lucide-react-native", () => ({
  RadioTower: () => null,
  Share2: () => null,
  Wifi: () => null,
  WifiOff: () => null,
}));
jest.mock("@shared/utils/device", () => ({
  extractDeviceType: () => "lightbulb",
  getDeviceImage: () => 1,
  getDeviceReachability: () => ({ reachable: true, source: "cloud" }),
  resolveDeviceCardRoutePath: () => "/(control)/Control",
}));
jest.mock("@shared/utils/matterLocalReachability", () => ({
  parseBridgedChildParentNodeId: () => undefined,
}));
jest.mock("@shared/utils/deviceParams", () => ({
  resolveDeviceCardPowerParam: (device?: {
    params?: { type: string }[];
  }) => device?.params?.find((param) => param.type === "esp.param.power"),
}));
jest.mock("@shared/utils/webStopClickPropagation", () => ({
  webStopClickPropagationProps: {},
}));
jest.mock("@shared/utils/deviceCardSensor", () => ({
  getDeviceCardSensorReadings: () => [],
}));
jest.mock("@shared/utils/paramUtils", () => ({
  coerceParamValueToBoolean: Boolean,
}));
jest.mock("@shared/utils/connectivity", () => ({
  resolveNodeUnavailableMessage: () => null,
}));
jest.mock("@shared/utils/constants", () => ({
  DEVICE_REACHABILITY_SOURCE_BRIDGE: "bridge",
  DEVICE_REACHABILITY_SOURCE_CONTROLLER: "controller",
  DEVICE_REACHABILITY_SOURCE_LOCAL: "local",
  DEVICE_WRITE_TIMEOUT_MS: 10000,
  POWER_PARAM_UNSUPPORTED_DEVICE_TYPES: new Set(),
  ERROR_CODES: { NODE_UNREACHABLE: "error.node.unreachable" },
  POWER_TOGGLE_INCOMING_HOLD_MS: 1000,
  POWER_TOGGLE_LATE_ECHO_MS: 3000,
  ESPRM_NAME_PARAM_TYPE: "esp.param.name",
  ESPRM_PARAM_WRITE_PROPERTY: "write",
  MATTER_METADATA_KEY: "Matter",
  MATTER_METADATA_DEVICE_NAME_KEY: "deviceName",
}));
jest.mock("@shared/theme/globalStyleSheet", () => ({
  globalStyles: new Proxy({}, { get: () => ({}) }),
}));
jest.mock("@shared/theme/switchFrameProps", () => ({ switchFrameProps: {} }));
jest.mock("@shared/theme/tokens", () => ({
  tokens: new Proxy({}, { get: () => new Proxy({}, { get: () => 1 }) }),
}));

interface StoreParam {
  name: string;
  type: string;
  properties: string[];
  value: unknown;
}

/** Puts one single-device node into the store, the way a sync does. */
function addNodeToStore(params: StoreParam[], matterName: string) {
  const node = observable({
    id: "1A2B3C4D5E6F7081",
    metadata: { Matter: { deviceName: matterName } },
    connectivityStatus: { isConnected: true },
    devices: [
      {
        name: "Light-EP1",
        type: "esp.device.lightbulb",
        displayName: "Light",
        params,
      },
    ],
  });
  runInAction(() => {
    mockStore.nodeStore.nodesByIDMap[node.id] = node;
  });
  return node;
}

function nameParam(value: unknown): StoreParam {
  return {
    name: "Name",
    type: "esp.param.name",
    properties: ["read", "write"],
    value,
  };
}

/**
 * A power param whose command answers after `replyMs`; on success the store
 * takes the value, the way a sync does, unless `storeHearsBack` is false.
 */
function powerParam(
  value: boolean,
  { replyMs = 500, storeHearsBack = true } = {},
) {
  const sent: boolean[] = [];
  let failWith: Error | null = null;
  const param = observable({
    name: "Power",
    type: "esp.param.power",
    properties: ["read", "write"],
    value: value as unknown,
    setValue: async (next: boolean) => {
      sent.push(next);
      const error = failWith;
      failWith = null;
      await new Promise((resolve) => setTimeout(resolve, replyMs));
      if (error) throw error;
      if (!storeHearsBack) return;
      runInAction(() => {
        param.value = next;
      });
    },
  });
  return {
    param,
    sent,
    failNextCommand: (error: Error) => {
      failWith = error;
    },
  };
}

/** Renders the card the way Home does: with a copy of the device. */
function renderCard(node: ReturnType<typeof addNodeToStore>) {
  render(
    <DeviceCard
      node={node as unknown as ESPCDFNode}
      device={{ ...node.devices[0] } as unknown as ESPCDFDevice}
    />,
  );
}

const tapPower = () => fireEvent.press(screen.getByTestId("switch_device_power"));

/** What the card's switch shows, read from its test id like the CI tests do. */
const shownPower = () =>
  screen.queryByTestId("card_power_state_on") ? "on" : "off";

async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe("DeviceCard name", () => {
  it("shows the name a Neo Matter light reports after the list was built", () => {
    const node = addNodeToStore([nameParam(undefined)], "Light");
    renderCard(node);
    expect(screen.getByText("Light")).toBeTruthy();

    act(() => {
      runInAction(() => {
        node.devices[0].params[0].value = "Living Room Light";
      });
    });

    expect(screen.getByText("Living Room Light")).toBeTruthy();
  });

  it("shows the name from a refresh that swapped in new params", () => {
    const node = addNodeToStore([nameParam("Light")], "Light");
    renderCard(node);

    act(() => {
      runInAction(() => {
        node.devices[0].params = [nameParam("Living Room Light")];
      });
    });

    expect(screen.getByText("Living Room Light")).toBeTruthy();
  });

  it("shows a classic pure Matter rename saved on the node", () => {
    const node = addNodeToStore([], "Light");
    renderCard(node);

    act(() => {
      runInAction(() => {
        node.metadata = { Matter: { deviceName: "Porch Light" } };
      });
    });

    expect(screen.getByText("Porch Light")).toBeTruthy();
  });
});

describe("DeviceCard power switch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockShowError.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("follows fast taps, sends only the latest while a command is on its way, and ends on the last tap", async () => {
    const power = powerParam(true);
    renderCard(addNodeToStore([power.param], "Light"));

    const shown: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      tapPower();
      shown.push(shownPower());
    }
    await wait(6000);

    expect(shown).toEqual(["off", "on", "off", "on"]);
    // First tap went out at once; the next three folded into the last one.
    expect(power.sent).toEqual([false, true]);
    expect(shownPower()).toBe("on");
  });

  it("keeps the tapped state when the store never hears back", async () => {
    const power = powerParam(true, { storeHearsBack: false });
    renderCard(addNodeToStore([power.param], "Light"));

    tapPower();
    await wait(6000);

    expect(power.sent).toEqual([false]);
    expect(shownPower()).toBe("off");
  });

  it("goes back and says the device is unreachable when a command never answers", async () => {
    const power = powerParam(true, { replyMs: 60000 });
    renderCard(addNodeToStore([power.param], "Light"));

    tapPower();
    expect(shownPower()).toBe("off");
    await wait(10000);

    expect(shownPower()).toBe("on");
    expect(mockShowError).toHaveBeenCalledWith("error.node.unreachable");
  });

  it("goes back and shows a generic error when a command fails", async () => {
    const power = powerParam(true);
    power.failNextCommand(new Error("boom"));
    renderCard(addNodeToStore([power.param], "Light"));

    tapPower();
    await wait(600);

    expect(shownPower()).toBe("on");
    expect(mockShowError).toHaveBeenCalledWith("device.errors.fallback");
  });

  it("shows a switch made elsewhere (wall, schedule, other phone) at once", () => {
    const power = powerParam(true);
    renderCard(addNodeToStore([power.param], "Light"));
    expect(shownPower()).toBe("on");

    act(() => {
      runInAction(() => {
        power.param.value = false;
      });
    });

    expect(shownPower()).toBe("off");
  });

  it("reads and writes the live store after a refresh swapped in new params", async () => {
    const before = powerParam(true);
    const node = addNodeToStore([before.param], "Light");
    renderCard(node);

    const after = powerParam(false);
    act(() => {
      runInAction(() => {
        node.devices[0].params = [after.param];
      });
    });
    expect(shownPower()).toBe("off");

    tapPower();
    await wait(6000);

    expect(before.sent).toEqual([]);
    expect(after.sent).toEqual([true]);
    expect(shownPower()).toBe("on");
  });
});
