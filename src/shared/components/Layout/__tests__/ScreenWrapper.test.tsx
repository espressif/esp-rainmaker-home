/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import ScreenWrapper from "../ScreenWrapper";

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@shared/theme/globalStyleSheet", () => ({
  globalStyles: { container: {} },
}));
jest.mock("@shared/utils/constants", () => ({ PLATFORM_WEB: "web" }));
jest.mock("@shared/utils/testProps", () => ({
  testProps: (id: string) => ({ testID: id }),
}));

describe("ScreenWrapper", () => {
  it("never takes focus, so Android cannot grey the screen with a focus highlight", () => {
    render(
      <ScreenWrapper qaId="screen_wrapper_settings">
        <Text>Device Settings</Text>
      </ScreenWrapper>,
    );

    expect(screen.getByTestId("screen_wrapper_settings").props.focusable).toBe(
      false,
    );
  });
});
