/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMNeoDevice } from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPRMNEO_NAME_PARAM_TYPE,
  MATTER_METADATA_DEVICE_NAME_KEY,
  MATTER_METADATA_KEY,
} from "../constants";

/**
 * Extracts the Matter device name stored on a node's metadata.
 *
 * Single-device Matter nodes carry their user-facing name inside the Matter
 * metadata block rather than in a device param, so this reads that nested value
 * defensively (the metadata shape is untyped and may be partially populated).
 * @param metadata - The parent node's metadata map, or `undefined` when unavailable.
 * @returns The Matter device name, or an empty string when absent or not a non-empty string.
 */
export function getMatterDeviceNameFromMetadata(
  metadata: Record<string, unknown> | undefined
): string {
  if (!metadata?.[MATTER_METADATA_KEY]) {
    return "";
  }
  const matter = metadata[MATTER_METADATA_KEY] as Record<string, unknown>;
  const deviceName = matter?.[MATTER_METADATA_DEVICE_NAME_KEY];
  return typeof deviceName === "string" && deviceName.length > 0
    ? deviceName
    : "";
}

/**
 * Resolves the best available display name for a device.
 *
 * Names can live in several places depending on device type (Matter vs. classic
 * RainMaker), so this applies a fixed precedence and returns the first non-empty
 * candidate: Matter metadata name → `esp.param.name` value → device `displayName`
 * → device `name` → the caller-supplied fallback.
 * @param nodeMetadata - Metadata of the parent node, used to source the Matter name.
 * @param device - The device whose display name should be resolved.
 * @param fallback - Value returned when no name can be resolved (defaults to an empty string).
 * @returns The resolved display name, or `fallback` when none is available.
 */
export function resolveDeviceDisplayName(
  nodeMetadata: Record<string, unknown> | undefined,
  device: ESPRMNeoDevice,
  fallback = ""
): string {
  if (!device) {
    return fallback;
  }

  const matterName = getMatterDeviceNameFromMetadata(nodeMetadata);
  if (matterName) {
    return matterName;
  }

  const nameParam = device.params?.find((p) => p.type === ESPRMNEO_NAME_PARAM_TYPE);
  return (
    (nameParam?.value as string | undefined) ||
    device.displayName ||
    device.name ||
    fallback
  );
}
