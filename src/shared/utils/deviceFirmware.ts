/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Where a device's firmware version comes from.
 *
 * Most nodes publish it in their cloud config. A node that never joins the cloud
 * has no config to publish, so its version is either captured at commissioning or
 * read from the device on demand. Callers get a value or a "you need to read it"
 * flag, and never have to know which kind of node they are looking at.
 */

import type { ESPCDFNode, ESPCDFNodeConfig } from "@store";
import { readMatterSoftwareVersion } from "./matterBasicInformation";
import {
  readMatterNodeIdFromCdfNode,
  readMatterSoftwareVersionFromCdfNode,
} from "./matterDeviceStateEvents";

/** Stand-in a config carries when the required `fw_version` is not known. */
const UNKNOWN_FIRMWARE_VERSION = "unknown";

/** Whether a version string names a real version rather than a stand-in. */
const isRealFirmwareVersion = (
  value: string | undefined,
): value is string => {
  const trimmed = value?.trim() ?? "";
  return trimmed !== "" && trimmed.toLowerCase() !== UNKNOWN_FIRMWARE_VERSION;
};

/**
 * Firmware version available without touching the network.
 *
 * Prefers the cloud config, then a version captured when the node was added.
 * @param node - CDF node being displayed
 * @param nodeConfig - Cloud config for that node, when it has one
 * @returns Version string, or undefined when only a live read can supply it
 */
export const getStoredFirmwareVersion = (
  node: ESPCDFNode | undefined,
  nodeConfig: ESPCDFNodeConfig | undefined,
): string | undefined => {
  const cloudVersion = nodeConfig?.info?.firmwareVersion;
  if (isRealFirmwareVersion(cloudVersion)) {
    return cloudVersion;
  }
  const capturedVersion = node
    ? readMatterSoftwareVersionFromCdfNode(node)
    : undefined;
  return isRealFirmwareVersion(capturedVersion) ? capturedVersion : undefined;
};

/**
 * Whether the version can only be obtained by reading the device itself.
 *
 * True for a node with no cloud config and nothing captured earlier — typically
 * one added on another phone, or after an app reinstall.
 * @param node - CDF node being displayed
 * @param nodeConfig - Cloud config for that node, when it has one
 * @returns True when the caller should perform a live read
 */
export const needsLiveFirmwareRead = (
  node: ESPCDFNode | undefined,
  nodeConfig: ESPCDFNodeConfig | undefined,
): boolean => {
  if (!node || getStoredFirmwareVersion(node, nodeConfig)) {
    return false;
  }
  return Boolean(readMatterNodeIdFromCdfNode(node));
};

/**
 * Reads the firmware version straight from the device.
 *
 * Only meaningful when {@link needsLiveFirmwareRead} returned true.
 * @param node - CDF node to read from
 * @returns Version string, or undefined when the device did not answer
 */
export const readLiveFirmwareVersion = async (
  node: ESPCDFNode | undefined,
): Promise<string | undefined> => {
  const deviceId = node ? readMatterNodeIdFromCdfNode(node) : undefined;
  return deviceId ? readMatterSoftwareVersion(deviceId) : undefined;
};
