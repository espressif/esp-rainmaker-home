/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebEspDeviceState } from "../types/types";

/** In-memory registry of RainMaker web provisioning devices keyed by device name. */
const deviceRegistry = new Map<string, WebEspDeviceState>();

/**
 * Returns a registered device by name.
 * @param deviceName - BLE device name
 * @returns Device state or undefined when not registered
 */
export function getRegisteredDevice(
  deviceName: string,
): WebEspDeviceState | undefined {
  return deviceRegistry.get(deviceName);
}

/**
 * Registers or replaces a device in the in-memory registry.
 * @param state - Device state to store
 */
export function registerDevice(state: WebEspDeviceState): void {
  deviceRegistry.set(state.name, state);
}

/**
 * Removes a device from the registry.
 * @param deviceName - BLE device name
 */
export function unregisterDevice(deviceName: string): void {
  deviceRegistry.delete(deviceName);
}

/**
 * Clears discovery caches before a new scan or create flow.
 */
export function clearDeviceRegistry(): void {
  deviceRegistry.clear();
}

/**
 * Returns all registered devices.
 * @returns Array of device states
 */
export function getAllRegisteredDevices(): WebEspDeviceState[] {
  return Array.from(deviceRegistry.values());
}
