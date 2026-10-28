/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addNetworkStateListener,
  NetworkStateType,
  type NetworkState,
} from "expo-network";

type WifiListener = () => void;

const lostListeners = new Set<WifiListener>();
let subscription: { remove: () => void } | null = null;

/** True on Wi-Fi or Ethernet, false otherwise, undefined while unknown. */
function onLocalNetwork(state: NetworkState): boolean | undefined {
  if (state.type === NetworkStateType.UNKNOWN || state.type === undefined) {
    return undefined;
  }
  return (
    state.type === NetworkStateType.WIFI ||
    state.type === NetworkStateType.ETHERNET
  );
}

// No previous state is kept: on Android the reading taken as Wi-Fi returns
// can still say cellular, which would hide the next loss.
function handleNetworkState(state: NetworkState): void {
  if (onLocalNetwork(state) !== false) {
    return;
  }
  for (const listener of [...lostListeners]) {
    try {
      listener();
    } catch (error) {
      console.warn("[wifiState] listener failed:", error);
    }
  }
}

function watchNetwork(): void {
  if (!subscription) {
    subscription = addNetworkStateListener(handleNetworkState);
  }
}

function unwatchNetworkIfIdle(): void {
  if (lostListeners.size === 0 && subscription) {
    subscription.remove();
    subscription = null;
  }
}

/**
 * Calls `listener` on each network change that leaves the phone off Wi-Fi.
 * It can repeat, so the listener must be safe to call more than once.
 * @param listener - Called on each such change.
 * @returns Function that removes the listener.
 */
export function onWifiLost(listener: WifiListener): () => void {
  lostListeners.add(listener);
  watchNetwork();
  return () => {
    lostListeners.delete(listener);
    unwatchNetworkIfIdle();
  };
}
