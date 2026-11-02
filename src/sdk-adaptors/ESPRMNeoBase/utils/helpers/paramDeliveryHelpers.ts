/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * When each param last reached the store over a live (non-MQTT) channel:
 * node id → `device::param` → time in ms.
 */
const lastDeliveryByNodeId = new Map<string, Map<string, number>>();

/**
 * Key for one param of one device.
 * @param deviceName - Device name
 * @param paramName - Param name
 * @returns The `device::param` key
 */
const paramKey = (deviceName: string, paramName: string): string =>
  `${deviceName}::${paramName}`;

/**
 * Notes that a live channel delivered these params to the store just now.
 * @param nodeId - Node the update is for
 * @param payload - Update params: device name → param name → value
 */
export function noteParamDelivery(
  nodeId: string,
  payload: Record<string, unknown>,
): void {
  const now = Date.now();
  const delivered =
    lastDeliveryByNodeId.get(nodeId) ?? new Map<string, number>();
  for (const [deviceName, deviceParams] of Object.entries(payload)) {
    if (
      !deviceParams ||
      typeof deviceParams !== "object" ||
      Array.isArray(deviceParams)
    ) {
      continue;
    }
    for (const paramName of Object.keys(deviceParams)) {
      delivered.set(paramKey(deviceName, paramName), now);
    }
  }
  if (delivered.size > 0) {
    lastDeliveryByNodeId.set(nodeId, delivered);
  }
}

/**
 * Whether a live channel delivered one param of a node within the last
 * `withinMs` milliseconds.
 * @param nodeId - Node to ask about
 * @param deviceName - Device name
 * @param paramName - Param name
 * @param withinMs - How far back a delivery still counts
 * @returns True when that param was delivered recently enough
 */
export function wasParamDeliveredWithin(
  nodeId: string,
  deviceName: string,
  paramName: string,
  withinMs: number,
): boolean {
  const deliveredAt = lastDeliveryByNodeId
    .get(nodeId)
    ?.get(paramKey(deviceName, paramName));
  return deliveredAt !== undefined && Date.now() - deliveredAt <= withinMs;
}

/** Forgets every noted delivery, e.g. when the SDK starts again. */
export function clearParamDeliveries(): void {
  lastDeliveryByNodeId.clear();
}
