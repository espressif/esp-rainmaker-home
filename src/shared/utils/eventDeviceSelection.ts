/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sorts items by connectivity: connected first, then disconnected.
 * Pure; returns a new array without mutating the input.
 * @param items - Array to sort
 * @param getIsConnected - Returns true if the item is connected
 * @returns New sorted array
 */
export function sortByConnectivity<T>(
  items: T[],
  getIsConnected: (item: T) => boolean
): T[] {
  return [...items].sort((a, b) => {
    const aOnline = getIsConnected(a);
    const bOnline = getIsConnected(b);
    return aOnline === bOnline ? 0 : bOnline ? 1 : -1;
  });
}
