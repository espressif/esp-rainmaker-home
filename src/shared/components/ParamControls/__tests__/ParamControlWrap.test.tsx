/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactElement } from "react";
import { Pressable, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { observable, runInAction } from "mobx";
import ParamControlWrap from "../ParamControlWrap";

const mockShowError = jest.fn();
jest.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ showError: mockShowError }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@shared/utils/constants", () => ({
  DEVICE_WRITE_TIMEOUT_MS: 10000,
  ERROR_CODES: { NODE_UNREACHABLE: "error.node.unreachable" },
  ESPRM_PARAM_READ_PROPERTY: "read",
  ESPRM_PARAM_TIME_SERIES_PROPERTY: "time_series",
  ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY: "simple_ts",
  ESPRM_PARAM_WRITE_PROPERTY: "write",
  PARAM_CONTROL_THROTTLE_MS: 400,
  POWER_TOGGLE_INCOMING_HOLD_MS: 1000,
  POWER_TOGGLE_LATE_ECHO_MS: 3000,
}));
jest.mock("@shared/utils/paramUtils", () => ({
  buildParamControlMeta: () => ({}),
  coerceParamValueToBoolean: (value: unknown) => value === true,
  isBooleanControlParam: (param: { type: string }) =>
    param.type === "esp.param.power",
  shouldPersistWriteWithoutLocalUpdate: () => false,
}));
jest.mock("@shared/utils/deviceParams", () => ({
  resolveParamDisplayLabel: (param: { name: string }) => param.name,
}));
jest.mock("../lib/types", () => ({
  getParamBounds: (param: { bounds?: { min: number; max: number } }) =>
    param.bounds ?? { min: undefined, max: undefined },
  comparableRoundedParamNumber: () => null,
  normalizeNumericParamValue: (value: unknown) => value,
}));

/** Stands in for PowerButton: asks for the opposite of what it shows. */
function FakePowerButton(props: {
  value?: unknown;
  onValueChange?: (event: null, next: unknown) => void;
}) {
  return (
    <Pressable
      testID="power"
      onPress={() => props.onValueChange?.(null, props.value !== true)}
    >
      <Text>{props.value === true ? "on" : "off"}</Text>
    </Pressable>
  );
}

/** Stands in for a dropdown: each press picks the next mode. */
function FakeModePicker(props: {
  value?: unknown;
  onValueChange?: (event: null, next: unknown) => void;
}) {
  const next = props.value === "Auto" ? "Cool" : "Auto";
  return (
    <Pressable testID="mode" onPress={() => props.onValueChange?.(null, next)}>
      <Text>{String(props.value)}</Text>
    </Pressable>
  );
}

/** Stands in for a slider: each press moves it up by 10. */
function FakeSlider(props: {
  value?: unknown;
  onValueChange?: (event: null, next: unknown) => void;
}) {
  return (
    <Pressable
      testID="slider"
      onPress={() => props.onValueChange?.(null, Number(props.value) + 10)}
    >
      <Text>{String(props.value)}</Text>
    </Pressable>
  );
}

/**
 * A param whose command takes `replyMs`; on success the store takes the value,
 * the way the store syncs a write, unless `storeHearsBack` is false.
 */
function makeParam(
  type: string,
  value: unknown,
  replyMs = 500,
  storeHearsBack = true,
) {
  const sent: unknown[] = [];
  let failWith: Error | null = null;
  const param = observable({
    name: type === "esp.param.power" ? "Power" : "Mode",
    type,
    properties: ["read", "write"],
    value,
    setValue: async (next: unknown) => {
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

function renderControl(param: unknown, child: ReactElement) {
  return render(
    <ParamControlWrap param={param as never} setUpdating={() => undefined}>
      {child}
    </ParamControlWrap>,
  );
}

async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockShowError.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ParamControlWrap power button", () => {
  it("follows 6 fast taps and leaves the light on the last one", async () => {
    const { param, sent } = makeParam("esp.param.power", true);
    renderControl(param, <FakePowerButton />);

    const shown: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      fireEvent.press(screen.getByTestId("power"));
      shown.push(screen.getByText(/^(on|off)$/).props.children);
      await wait(350);
    }
    await wait(6000);

    expect(shown).toEqual(["off", "on", "off", "on", "off", "on"]);
    expect(sent[sent.length - 1]).toBe(true);
    expect(screen.getByText("on")).toBeTruthy();
  });

  it("goes back and shows a generic error when a command fails", async () => {
    const control = makeParam("esp.param.power", true);
    control.failNextCommand(new Error("boom"));
    renderControl(control.param, <FakePowerButton />);

    fireEvent.press(screen.getByTestId("power"));
    expect(screen.getByText("off")).toBeTruthy();
    await wait(600);

    expect(screen.getByText("on")).toBeTruthy();
    expect(mockShowError).toHaveBeenCalledWith("device.errors.fallback");
  });

  it("says the device is unreachable when a command never answers", async () => {
    const control = makeParam("esp.param.power", true, 60000);
    renderControl(control.param, <FakePowerButton />);

    fireEvent.press(screen.getByTestId("power"));
    await wait(10000);

    expect(screen.getByText("on")).toBeTruthy();
    expect(mockShowError).toHaveBeenCalledWith("error.node.unreachable");
  });

  it("shows no toast once the screen has closed", async () => {
    const control = makeParam("esp.param.power", true);
    control.failNextCommand(new Error("boom"));
    const view = renderControl(control.param, <FakePowerButton />);

    fireEvent.press(screen.getByTestId("power"));
    view.unmount();
    await wait(600);

    expect(mockShowError).not.toHaveBeenCalled();
  });
});

describe("ParamControlWrap dropdown", () => {
  it("keeps showing the pick until its write settles", async () => {
    const { param, sent } = makeParam("esp.param.mode", "Cool");
    renderControl(param, <FakeModePicker />);

    fireEvent.press(screen.getByTestId("mode"));
    expect(screen.getByText("Auto")).toBeTruthy();
    await wait(200); // write still on its way
    expect(screen.getByText("Auto")).toBeTruthy();

    await wait(1000);
    expect(sent).toEqual(["Auto"]);
    expect(screen.getByText("Auto")).toBeTruthy();
  });

  it("keeps the pick when the store never hears back", async () => {
    const { param } = makeParam("esp.param.mode", "Cool", 500, false);
    renderControl(param, <FakeModePicker />);

    fireEvent.press(screen.getByTestId("mode"));
    await wait(1000);

    expect(screen.getByText("Auto")).toBeTruthy();
  });

  it("goes back to the store value and shows an error when the write fails", async () => {
    const control = makeParam("esp.param.mode", "Cool");
    control.failNextCommand(new Error("boom"));
    renderControl(control.param, <FakeModePicker />);

    fireEvent.press(screen.getByTestId("mode"));
    expect(screen.getByText("Auto")).toBeTruthy();
    await wait(600);

    expect(screen.getByText("Cool")).toBeTruthy();
    expect(mockShowError).toHaveBeenCalledWith("device.errors.fallback");
  });
});

describe("ParamControlWrap slider", () => {
  it("does not let a write that never answers block the next one", async () => {
    const sent: number[] = [];
    const param = observable({
      name: "Brightness",
      type: "esp.param.brightness",
      properties: ["read", "write"],
      bounds: { min: 0, max: 100 },
      value: 50 as unknown,
      // The first write is lost; later ones answer at once and the store takes them.
      setValue: async (next: number) => {
        sent.push(next);
        if (sent.length === 1) await new Promise<void>(() => undefined);
        runInAction(() => {
          param.value = next;
        });
      },
    });
    renderControl(param, <FakeSlider />);

    fireEvent.press(screen.getByTestId("slider")); // 60, never answered
    await wait(100);
    fireEvent.press(screen.getByTestId("slider")); // 70, queued behind it
    await wait(5000);
    expect(sent).toEqual([60]);

    await wait(6000); // past the 10 s cut-off
    expect(sent).toEqual([60, 70]);
    expect(screen.getByText("70")).toBeTruthy();
  });
});
