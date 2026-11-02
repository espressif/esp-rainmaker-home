/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFGroup, ESPCDFUser } from "@store";
import { onSessionEnd } from "@shared/utils/userSession";

/** Custom-data key holding the user's last chosen home. */
const LAST_SELECTED_HOME_KEY = "lastSelectedHomeId";

/**
 * A home shown only because the saved choice could not be read (e.g. the
 * profile did not load on an offline start). It is not the user's choice, so
 * it is never saved, and the next sync does not take it for one.
 */
let homeShownWithoutSaving: string | null = null;

onSessionEnd(() => {
  homeShownWithoutSaving = null;
});

/** Which home a home sync shows, and whether to save it as the last choice. */
export interface HomeToShow {
  home: ESPCDFGroup | null;
  /** True to save `home` as the user's last chosen home. */
  saveAsLastChoice: boolean;
}

/**
 * Reads the saved last-chosen home id from a custom-data blob.
 * @param customData - User custom data, as stored or as fetched.
 * @returns The saved home id, or `undefined` when there is none.
 */
function savedHomeIdIn(customData: unknown): string | undefined {
  const entry = (customData as Record<string, { value?: unknown }> | undefined)
    ?.[LAST_SELECTED_HOME_KEY];
  return typeof entry?.value === "string" && entry.value.length > 0
    ? entry.value
    : undefined;
}

/**
 * Reads the user's saved last-chosen home, fetching custom data when this
 * session never loaded it.
 * @param user - Signed-in CDF user.
 * @returns The saved id, and whether it is known (false when the fetch failed).
 */
async function readSavedHomeId(
  user: ESPCDFUser,
): Promise<{ id?: string; known: boolean }> {
  const local = savedHomeIdIn(user.customData);
  if (local) {
    return { id: local, known: true };
  }
  try {
    const fetched = await user.getCustomData();
    return {
      id: savedHomeIdIn(fetched) ?? savedHomeIdIn(user.customData),
      known: true,
    };
  } catch (error) {
    console.warn(
      "[homeToShow] Could not read the saved home; showing another one without saving it:",
      error,
    );
    return { known: false };
  }
}

/**
 * Picks the home a home sync shows: the one the user is on in this session,
 * else the user's saved last choice, else a fallback. A fallback is saved only
 * when it cannot replace a saved choice that simply could not be read.
 * @param user - Signed-in CDF user.
 * @param homes - Homes after this sync.
 * @param currentHomeId - Home the store shows now, if any.
 * @param pickFallback - Picks a home when neither of the above applies.
 * @returns The home to show and whether to save it.
 */
export async function chooseHomeToShow(
  user: ESPCDFUser,
  homes: ESPCDFGroup[],
  currentHomeId: string | null | undefined,
  pickFallback: (homes: ESPCDFGroup[]) => ESPCDFGroup | null = (list) =>
    list[0] ?? null,
): Promise<HomeToShow> {
  const findHome = (id: string | null | undefined) =>
    id ? homes.find((home) => home.id === id) : undefined;

  const current =
    currentHomeId !== homeShownWithoutSaving
      ? findHome(currentHomeId)
      : undefined;
  if (current) {
    homeShownWithoutSaving = null;
    return { home: current, saveAsLastChoice: true };
  }

  const saved = await readSavedHomeId(user);
  const savedHome = findHome(saved.id);
  if (savedHome) {
    homeShownWithoutSaving = null;
    return { home: savedHome, saveAsLastChoice: false };
  }

  const fallback = pickFallback(homes);
  homeShownWithoutSaving = saved.known ? null : (fallback?.id ?? null);
  return { home: fallback, saveAsLastChoice: saved.known && fallback !== null };
}

/**
 * Called when the user picks a home themselves: from then on it is their
 * choice, even if a sync had shown it only as a fallback.
 */
export function forgetHomeShownWithoutSaving(): void {
  homeShownWithoutSaving = null;
}
