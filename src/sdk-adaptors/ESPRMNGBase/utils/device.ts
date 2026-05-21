/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNG_NAME_PARAM_TYPE,
  MATTER_METADATA_DEVICE_NAME_KEY,
  MATTER_METADATA_KEY,
} from "./constants";
import { ESPRMNGDevice } from "@espressif/rmng-base-sdk";

/**
 * Matter device name stored on the node metadata (single-device Matter nodes).
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
 * Resolves the display name for a device given parent node metadata and fallbacks:
 * Matter metadata name → esp.param.name → displayName → device id → optional fallback.
 */
export function resolveDeviceDisplayName(
  nodeMetadata: Record<string, unknown> | undefined,
  device: ESPRMNGDevice,
  fallback = ""
): string {
  if (!device) {
    return fallback;
  }

  const matterName = getMatterDeviceNameFromMetadata(nodeMetadata);
  if (matterName) {
    return matterName;
  }

  const nameParam = device.params?.find((p) => p.type === ESPRMNG_NAME_PARAM_TYPE);
  return (
    (nameParam?.value as string | undefined) ||
    device.displayName ||
    device.id ||
    fallback
  );
}
