/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from "expo-network";

type InternetBackListener = () => void;

const listeners = new Set<InternetBackListener>();
let subscription: { remove: () => void } | null = null;
/** Last known state; `undefined` until the first reading arrives. */
let wasReachable: boolean | undefined;

/**
 * Whether a network state can reach the internet. On Android this turns true
 * as soon as a network is up, a moment before the system has checked it.
 * @param state - Network state from expo-network.
 * @returns True when the internet should be reachable.
 */
function canReachInternet(state: NetworkState): boolean {
  return state.isInternetReachable ?? state.isConnected === true;
}

/**
 * Tells every listener when the internet comes back after it was unreachable.
 * The first reading only sets the starting point, so it never counts as back.
 * @param state - Network state from expo-network.
 */
function handleNetworkState(state: NetworkState): void {
  const reachable = canReachInternet(state);
  const cameBack = reachable && wasReachable === false;
  wasReachable = reachable;
  if (!cameBack) {
    return;
  }
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.warn("[internetBack] listener failed:", error);
    }
  }
}

/**
 * Calls `listener` each time the internet becomes reachable again after the
 * phone was offline (Wi-Fi back on, airplane mode off).
 * @param listener - Called once per return of the internet.
 * @returns Function that removes the listener again.
 */
export function onInternetBack(listener: InternetBackListener): () => void {
  listeners.add(listener);
  if (!subscription) {
    subscription = addNetworkStateListener(handleNetworkState);
    getNetworkStateAsync()
      .then((state) => {
        if (wasReachable === undefined) {
          wasReachable = canReachInternet(state);
        }
      })
      .catch(() => {});
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && subscription) {
      subscription.remove();
      subscription = null;
      wasReachable = undefined;
    }
  };
}
