/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import DeviceName from "../DeviceName";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("lucide-react-native", () => ({ Edit3: () => null }));
jest.mock("@shared/components", () => {
  const { View, TextInput } = jest.requireActual("react-native");
  return {
    ContentWrapper: ({ children }: { children: unknown }) => (
      <View>{children}</View>
    ),
    Input: TextInput,
  };
});
jest.mock("@shared/theme/tokens", () => ({
  tokens: new Proxy({}, { get: () => new Proxy({}, { get: () => 1 }) }),
}));
jest.mock("@shared/theme/globalStyleSheet", () => ({ globalStyles: {} }));
jest.mock("@shared/utils/testProps", () => ({
  testProps: (id: string) => ({ testID: id }),
}));
jest.mock("@shared/utils/deviceNaming", () => ({
  DEVICE_NAME_PROBLEM_MESSAGE_KEYS: {
    empty: "device.validation.deviceNameCannotBeEmpty",
    "too-long": "device.validation.deviceNameTooLong",
  },
  findDeviceNameProblem: (name: string, max: number | undefined) => {
    if (!name.trim()) return "empty";
    return max !== undefined && name.trim().length > max ? "too-long" : undefined;
  },
}));

/** Renders the field with a fresh save spy. */
function renderField(maxNameLength?: number) {
  const onSave = jest.fn();
  render(
    <DeviceName
      initialDeviceName="Living Room Light"
      deviceName="Living Room Lig"
      setDeviceName={jest.fn()}
      setIsEditingName={jest.fn()}
      onSave={onSave}
      isSaving={false}
      isConnected
      disabled={false}
      maxNameLength={maxNameLength}
    />,
  );
  return {
    onSave,
    input: screen.getByPlaceholderText(
      "device.settings.enterDeviceNamePlaceholder",
    ),
  };
}

describe("DeviceName", () => {
  it("never lets the tap area around the field take focus, so the card is not greyed after Done", () => {
    render(
      <DeviceName
        initialDeviceName="Hall Light"
        deviceName="Hall Light"
        setDeviceName={jest.fn()}
        setIsEditingName={jest.fn()}
        onSave={jest.fn()}
        isSaving={false}
        isConnected
        disabled={false}
      />,
    );

    expect(screen.getByTestId("button_edit_device_name").props.focusable).toBe(
      false,
    );
  });

  it("saves on the keyboard's Done key", () => {
    const { onSave, input } = renderField();
    fireEvent(input, "submitEditing");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("never saves a half-typed name just because the field lost focus", () => {
    const { onSave, input } = renderField();
    fireEvent(input, "blur");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the too-long message for the device's limit", () => {
    const { input } = renderField(32);
    expect(input.props.validator("x".repeat(33))).toEqual({
      isValid: false,
      error: "device.validation.deviceNameTooLong",
    });
    expect(input.props.validator("x".repeat(32))).toEqual({ isValid: true });
  });
});
