/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDF, ESPCDFGroup } from "@store";
import { getSessionId, isSessionActive } from "@shared/utils/userSession";
import { subscribeNewNodesToUpdates } from "@shared/utils/nodeUpdateSubscription";

/**
 * Loads the nodes of one home into the store with a single `node_details` call.
 * The CDF fills the home's rooms from the same reply.
 *
 * Nodes are fetched only for homes the user opens: the login sync loads the
 * selected home, and this runs when the selection changes. When the home already
 * has nodes (from an earlier visit or the disk snapshot) they are shown at once
 * and refreshed in the background; a home opened for the first time is awaited
 * so the screen does not flash an empty state. Nodes new to the store are then
 * subscribed to live updates, which the home sync's subscribe did not cover.
 * @param home - The home that just became current
 * @param store - CDF store the nodes land in
 */
export async function loadHomeNodes(
  home: ESPCDFGroup | null | undefined,
  store: ESPCDF,
): Promise<void> {
  if (!home) return;
  const sessionId = getSessionId();
  const refresh = home
    .getNodes()
    .then(() => {
      // Only the open home: Home Management loads the others in the background,
      // and each extra subscribe adds a callback per node on classic.
      if (store.getCurrentHome()?.id !== home.id) return;
      void subscribeLoadedNodes(store, sessionId);
    })
    .catch((error: unknown) => {
      console.warn(`[homeNodes] loading nodes for home ${home.id} failed:`, error);
    });
  if (!home.nodeDetails?.length) {
    await refresh;
  }
}

/**
 * Gives nodes that just landed in the store live updates. Without it a home
 * opened after the sync (e.g. one just shared) never got its cloud pushes.
 * @param store - CDF store holding the nodes
 * @param sessionId - Session the load started in; skipped once it ended
 */
async function subscribeLoadedNodes(
  store: ESPCDF,
  sessionId: number,
): Promise<void> {
  const user = store?.userStore?.user;
  const nodeList = store?.nodeStore?.nodesList;
  if (!user || !nodeList || !isSessionActive(sessionId)) return;
  try {
    await subscribeNewNodesToUpdates(user, nodeList);
  } catch (error: unknown) {
    console.warn("[homeNodes] subscribing loaded nodes to updates failed:", error);
  }
}
