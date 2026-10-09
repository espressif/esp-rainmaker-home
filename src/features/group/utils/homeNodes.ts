/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFGroup } from "@store";

/**
 * Loads the nodes of one home into the store with a single `node_details` call.
 * The CDF fills the home's rooms from the same reply.
 *
 * Nodes are fetched only for homes the user opens: the login sync loads the
 * selected home, and this runs when the selection changes. When the home already
 * has nodes (from an earlier visit or the disk snapshot) they are shown at once
 * and refreshed in the background; a home opened for the first time is awaited
 * so the screen does not flash an empty state.
 * @param home - The home that just became current
 */
export async function loadHomeNodes(
  home: ESPCDFGroup | null | undefined,
): Promise<void> {
  if (!home) return;
  const refresh = home
    .getNodes()
    .then(() => undefined)
    .catch((error: unknown) => {
      console.warn(`[homeNodes] loading nodes for home ${home.id} failed:`, error);
    });
  if (!home.nodeDetails?.length) {
    await refresh;
  }
}
