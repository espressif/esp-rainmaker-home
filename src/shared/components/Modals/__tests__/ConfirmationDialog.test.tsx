/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import ConfirmationDialog from "../ConfirmationDialog";

jest.mock("tamagui", () => {
  const { Pressable } = jest.requireActual("react-native");
  return { Button: Pressable };
});
jest.mock("@shared/theme/tokens", () => ({
  tokens: new Proxy({}, { get: () => new Proxy({}, { get: () => 1 }) }),
}));
jest.mock("@shared/theme/globalStyleSheet", () => ({ globalStyles: {} }));
jest.mock("@shared/utils/testProps", () => ({
  testProps: (id: string) => ({ testID: id }),
}));

function renderDialog(onDismiss?: () => void) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(
    <ConfirmationDialog
      open
      description="Save it before leaving?"
      confirmText="Save"
      cancelText="Discard"
      onConfirm={onConfirm}
      onCancel={onCancel}
      onDismiss={onDismiss}
      qaId="unsaved_device_name"
    />,
  );
  const modal = screen.getByTestId("dialog_unsaved_device_name");
  return { onConfirm, onCancel, modal };
}

describe("ConfirmationDialog", () => {
  it("Android back runs onDismiss, not the cancel button's action", () => {
    const onDismiss = jest.fn();
    const { onCancel, onConfirm, modal } = renderDialog(onDismiss);

    fireEvent(modal, "requestClose");

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Android back still cancels when no onDismiss is given", () => {
    const { onCancel, modal } = renderDialog();

    fireEvent(modal, "requestClose");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("buttons keep their actions", () => {
    const onDismiss = jest.fn();
    const { onCancel, onConfirm } = renderDialog(onDismiss);

    fireEvent.press(screen.getByTestId("button_confirm_dialog"));
    fireEvent.press(screen.getByTestId("button_cancel_dialog"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
