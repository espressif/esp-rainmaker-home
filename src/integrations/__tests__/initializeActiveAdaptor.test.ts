/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StartupError } from "@shared/utils/startupError";
import { initializeActiveAdaptor } from "../initializeActiveAdaptor";

describe("initializeActiveAdaptor", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("stops app start when the adaptor reports a startup error", async () => {
    const adaptor = {
      initializeSDK: jest.fn().mockRejectedValue(new StartupError("no Matter")),
    };

    await expect(initializeActiveAdaptor(adaptor)).rejects.toBeInstanceOf(
      StartupError,
    );
  });

  it("logs any other failure and lets the app carry on", async () => {
    const adaptor = {
      initializeSDK: jest.fn().mockRejectedValue(new Error("config check")),
    };

    await expect(initializeActiveAdaptor(adaptor)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
