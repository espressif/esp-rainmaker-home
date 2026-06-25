/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GroupStoreCallbacks } from "@store";

const WRAPPED_FLAG = "__matterDiscoveryGroupCallbacksWrapped";

let matterDiscoveryOnNodesAddedKick: (() => void) | undefined;

/** Registered from {@link startMatterLocalDiscovery} in the Matter feature layer. */
export function registerMatterDiscoveryOnNodesAddedKick(kick: () => void): void {
  matterDiscoveryOnNodesAddedKick = kick;
}

/** Rebuild rm↔matter map and replay pending discovery after nodes land in the store. */
export function kickMatterLocalDiscoveryAfterNodesInStore(): void {
  matterDiscoveryOnNodesAddedKick?.();
}

/**
 * Wraps CDF {@link GroupStoreCallbacks.addNodesToGroup} so late-added Matter nodes
 * trigger discovery map rebuild + pending replay.
 */
export function wrapGroupStoreCallbacksForMatterDiscovery(
  callbacks: GroupStoreCallbacks,
): GroupStoreCallbacks {
  return {
    ...callbacks,
    addNodesToGroup: (groupId, nodes) => {
      callbacks.addNodesToGroup(groupId, nodes);
      if (nodes.length > 0) {
        kickMatterLocalDiscoveryAfterNodesInStore();
      }
    },
  };
}

/**
 * Installs a one-shot wrapper on {@link ESPCDFUser.setStoreCallbacks} so every
 * adaptor-injected callback bundle gets the Matter discovery kick on node add.
 */
export function installMatterDiscoveryGroupCallbacksWrapper(user: {
  setStoreCallbacks?: (callbacks: GroupStoreCallbacks) => void;
}): void {
  const tagged = user as {
    [WRAPPED_FLAG]?: boolean;
    setStoreCallbacks?: (callbacks: GroupStoreCallbacks) => void;
  };
  if (tagged[WRAPPED_FLAG]) return;

  const original = user.setStoreCallbacks?.bind(user);
  if (!original) return;

  user.setStoreCallbacks = (callbacks) => {
    original(wrapGroupStoreCallbacksForMatterDiscovery(callbacks));
  };
  tagged[WRAPPED_FLAG] = true;
}
