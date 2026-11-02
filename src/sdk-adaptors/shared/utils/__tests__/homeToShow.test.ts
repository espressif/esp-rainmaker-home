/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFGroup, ESPCDFUser } from "@store";
import { endUserSession } from "@shared/utils/userSession";
import {
  chooseHomeToShow,
  forgetHomeShownWithoutSaving,
} from "../homeToShow";

const homes = [{ id: "home" }, { id: "cabin" }, { id: "studio" }] as ESPCDFGroup[];
const saved = (id: string) => ({ lastSelectedHomeId: { value: id } });

/** A user whose profile was never loaded; `fetch` answers the custom-data read. */
function userWithUnloadedProfile(fetch: () => Promise<unknown>) {
  return {
    customData: undefined,
    getCustomData: jest.fn(fetch),
  } as unknown as ESPCDFUser & { getCustomData: jest.Mock };
}

describe("chooseHomeToShow", () => {
  beforeEach(async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await endUserSession();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads the saved home when the profile never loaded (offline start), and keeps it", async () => {
    const user = userWithUnloadedProfile(async () => saved("cabin"));

    const choice = await chooseHomeToShow(user, homes, null);

    expect(user.getCustomData).toHaveBeenCalledTimes(1);
    expect(choice).toEqual({ home: { id: "cabin" }, saveAsLastChoice: false });
  });

  it("never saves the fallback when the saved home cannot be read, and does not take it for a choice later", async () => {
    const user = userWithUnloadedProfile(async () => {
      throw new Error("Network request failed");
    });

    const first = await chooseHomeToShow(user, homes, null);
    expect(first).toEqual({ home: { id: "home" }, saveAsLastChoice: false });

    // Next sync: the store now shows "home", but only as a fallback.
    user.getCustomData.mockImplementation(async () => saved("cabin"));
    const next = await chooseHomeToShow(user, homes, "home");
    expect(next).toEqual({ home: { id: "cabin" }, saveAsLastChoice: false });
  });

  it("keeps the home the user switched to in this session over the saved one", async () => {
    const user = {
      customData: saved("studio"),
      getCustomData: jest.fn(),
    } as unknown as ESPCDFUser;

    const choice = await chooseHomeToShow(user, homes, "home");

    expect(choice).toEqual({ home: { id: "home" }, saveAsLastChoice: true });
  });

  it("treats a fallback the user then picks themselves as their choice", async () => {
    const user = userWithUnloadedProfile(async () => {
      throw new Error("Network request failed");
    });
    await chooseHomeToShow(user, homes, null);

    forgetHomeShownWithoutSaving();
    const choice = await chooseHomeToShow(user, homes, "home");
    expect(choice).toEqual({ home: { id: "home" }, saveAsLastChoice: true });
  });

  it("saves the fallback when there is no saved home, or it was deleted", async () => {
    const none = userWithUnloadedProfile(async () => ({}));
    expect(await chooseHomeToShow(none, homes, null)).toEqual({
      home: { id: "home" },
      saveAsLastChoice: true,
    });

    const deleted = {
      customData: saved("gone"),
      getCustomData: jest.fn(async () => saved("gone")),
    } as unknown as ESPCDFUser;
    expect(await chooseHomeToShow(deleted, homes, null)).toEqual({
      home: { id: "home" },
      saveAsLastChoice: true,
    });
  });
});
