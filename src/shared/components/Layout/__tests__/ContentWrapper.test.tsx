/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import ContentWrapper from "../ContentWrapper";

jest.mock("@shared/theme/tokens", () => ({
  tokens: new Proxy({}, { get: () => new Proxy({}, { get: () => 1 }) }),
}));
jest.mock("@shared/utils/testProps", () => ({
  testProps: (id: string) => ({ testID: id }),
}));

describe("ContentWrapper", () => {
  it("does not take focus when it does nothing on press", () => {
    render(
      <ContentWrapper title="Device Name" qaId="device_name">
        <Text>Hall Light</Text>
      </ContentWrapper>,
    );

    expect(screen.getByTestId("button_device_name").props.focusable).toBe(
      false,
    );
  });

  it("stays focusable when it has a press action", () => {
    render(
      <ContentWrapper title="Room" qaId="room" onPress={jest.fn()}>
        <Text>Not assigned</Text>
      </ContentWrapper>,
    );

    expect(screen.getByTestId("button_room").props.focusable).toBe(true);
  });
});
