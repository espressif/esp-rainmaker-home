/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The one place that decides which name a device shows.
 *
 * Cards, control and settings screens, setup screens and both cloud adaptors
 * all read the name through {@link getDeviceDisplayName}, so the name never
 * depends on which code path built or refreshed the device.
 */

import type { ESPCDFDevice, ESPCDFDeviceParam } from "@store";
import {
  ESPRM_NAME_PARAM_TYPE,
  ESPRM_PARAM_WRITE_PROPERTY,
  MATTER_METADATA_DEVICE_NAME_KEY,
  MATTER_METADATA_KEY,
} from "./constants";

/** The parts of a param the name rules read. */
interface NameSourceParam {
  type?: string;
  value?: unknown;
  properties?: readonly string[];
}

/** The parts of a device the name rules read (an app device or an SDK device). */
export interface NameSourceDevice {
  name?: string;
  displayName?: string;
  params?: readonly NameSourceParam[];
}

/** The parts of a node the name rules read. */
export interface NameSourceNode {
  metadata?: Record<string, unknown>;
  devices?: readonly unknown[];
  nodeConfig?: { info?: { name?: string } };
  /**
   * Set by the adaptor when every device shows the node's saved Matter name
   * (classic pure Matter, as the reference apps do).
   */
  sharesNodeName?: boolean;
}

/** A name param the user can change, i.e. the one a rename writes. */
const isEditableNameParam = (param: NameSourceParam): boolean =>
  param.type === ESPRM_NAME_PARAM_TYPE &&
  param.properties?.includes(ESPRM_PARAM_WRITE_PROPERTY) === true;

/**
 * Finds the name param a rename writes to.
 * @param device - Device on a node
 * @returns The editable name param, or undefined when the device has none
 */
export const getDeviceNameParam = (
  device: ESPCDFDevice | undefined,
): ESPCDFDeviceParam | undefined => device?.params?.find(isEditableNameParam);

/**
 * Reads the Matter name saved on a node.
 * @param metadata - Node metadata
 * @returns The saved Matter name, or undefined when there is none
 */
const getSavedMatterName = (
  metadata: Record<string, unknown> | undefined,
): unknown => {
  const matter = metadata?.[MATTER_METADATA_KEY] as
    | Record<string, unknown>
    | undefined;
  return matter?.[MATTER_METADATA_DEVICE_NAME_KEY];
};

/**
 * Reads the candidates in order and returns the first non-blank string. Later
 * candidates are not read at all, so a screen only follows the source it shows.
 */
const firstNonBlank = (
  ...candidates: (() => unknown)[]
): string | undefined => {
  for (const read of candidates) {
    const value = read();
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
};

/**
 * The name to show for a device.
 *
 * A name is read from where a rename saves it (see `saveDeviceName`):
 * 1. The editable name param. RainMaker devices on classic and Neo, with or
 *    without Matter, keep their name there. On a Neo pure Matter light it holds
 *    the light's own Matter name, which this phone also copies to the cloud.
 * 2. The Matter name saved on the node, for its only device, or for every
 *    device when the adaptor marks the node `sharesNodeName`. It is the only
 *    home of the name for a classic pure Matter device. Elsewhere it is the
 *    name from setup, so it only fills in until the param has a value.
 * 3. A name param the user cannot change, the name the SDK gave the device,
 *    the device's internal name, then the node's own name.
 *
 * Read it during render from the live store device so the screen follows
 * every name change.
 * @param device - Device to name
 * @param node - Its node, for the saved Matter name and the node's own name
 * @returns The name to show, or an empty string when nothing names the device
 */
export function getDeviceDisplayName(
  device: NameSourceDevice | undefined,
  node?: NameSourceNode,
): string {
  if (!device) {
    return "";
  }
  const params = device.params ?? [];
  const usesNodeName =
    node?.sharesNodeName === true || (node?.devices?.length ?? 0) <= 1;

  return (
    firstNonBlank(
      () => params.find(isEditableNameParam)?.value,
      () => (usesNodeName ? getSavedMatterName(node?.metadata) : undefined),
      () =>
        params.find(
          (param) =>
            param.type === ESPRM_NAME_PARAM_TYPE && !isEditableNameParam(param),
        )?.value,
      () => device.displayName,
      () => device.name,
      () => node?.nodeConfig?.info?.name,
    ) ?? ""
  );
}
