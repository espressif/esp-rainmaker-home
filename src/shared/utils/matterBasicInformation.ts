/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Node-level name and firmware version of Matter nodes, in CDF terms. The
 * Basic Information cluster itself lives in the native adaptor; this module
 * only decides which node qualifies and resolves its Matter id. It is the one
 * path to the device's Matter name: a rename and its later retries both write
 * through here, with the adaptor typed against its contract.
 */

import type { ESPMatterDeviceInfoAdapterInterface } from "@native-adaptors/contracts/matterDeviceInfo";
import {
  ESPMatterDeviceInfoAdapter,
  MATTER_NODE_LABEL_MAX_LENGTH,
} from "@native-adaptors/implementations/ESPMatterDeviceInfoAdapter";
import { MATTER_LOCAL_TRANSPORT_KEY, NODE_TYPE } from "./constants";
import { readMatterNodeIdFromCdfNode } from "./matterDeviceStateEvents";
import type { ESPCDFNode } from "@store";

export { MATTER_NODE_LABEL_MAX_LENGTH };

/** The native side, used only through its contract. */
const deviceInfoAdapter: ESPMatterDeviceInfoAdapterInterface =
  ESPMatterDeviceInfoAdapter;

/** Node types the cloud gives a device that is also on the Matter fabric. */
const MATTER_NODE_TYPES: readonly string[] = [
  NODE_TYPE.PURE_MATTER,
  NODE_TYPE.RAINMAKER_MATTER,
];

/**
 * Hybrid nodes never carry `matter_node_id` in their cloud config, so the
 * discovery transport is the only place the id lands.
 * @param node - Node backing the settings screen
 * @returns The node's Matter id, or undefined when it has none
 */
export function resolveMatterNodeId(node: ESPCDFNode): string | undefined {
  const fromNode = readMatterNodeIdFromCdfNode(node);
  if (fromNode) {
    return fromNode;
  }
  const fromTransport =
    node.availableTransports?.[MATTER_LOCAL_TRANSPORT_KEY]?.metadata
      ?.matterNodeId;
  return typeof fromTransport === "string" && fromTransport.trim()
    ? fromTransport.trim()
    : undefined;
}

/**
 * Whether the node is also a Matter device, reachable or not. A RainMaker +
 * Matter device off the local network has no Matter id yet, so its cloud node
 * type is checked too.
 * @param node - Node to check
 * @returns True when the node has a Matter side
 */
function hasMatterSide(node: ESPCDFNode): boolean {
  if (resolveMatterNodeId(node)) {
    return true;
  }
  const { type, nodeType, isMatter } = node as {
    type?: string;
    nodeType?: string;
    isMatter?: boolean;
  };
  return (
    isMatter === true ||
    MATTER_NODE_TYPES.includes(type ?? "") ||
    MATTER_NODE_TYPES.includes(nodeType ?? "")
  );
}

/**
 * Whether a rename of this node ends up in the device's Matter name
 * (`NodeLabel`), now or once the device is back on the local network.
 * Single-device only: writing `NodeLabel` on a multi-device node renames all.
 * @param node - Node being renamed
 * @returns True when the name must fit the Matter name's limit
 */
export function isNamedByMatterNodeLabel(node: ESPCDFNode): boolean {
  return hasMatterSide(node) && (node.devices?.length ?? 0) <= 1;
}

/**
 * Whether the Matter name can be written right now: the node qualifies and
 * is on the local network.
 * @param node - Node backing the settings screen
 * @returns True when the name should be written over the Matter fabric
 */
export function canRenameViaMatterNodeLabel(node: ESPCDFNode): boolean {
  return (
    isNamedByMatterNodeLabel(node) &&
    Boolean(resolveMatterNodeId(node)) &&
    Boolean(node.availableTransports?.[MATTER_LOCAL_TRANSPORT_KEY])
  );
}

/**
 * Writes a device name to the node's Matter name over the local fabric.
 * The caller checks the length: the name is sent as is, never cut.
 * @param node - Node to rename
 * @param name - New name, at most {@link MATTER_NODE_LABEL_MAX_LENGTH} long
 * @returns True when the device acknowledged the write
 */
export async function renameViaMatterNodeLabel(
  node: ESPCDFNode,
  name: string,
): Promise<boolean> {
  const matterNodeId = resolveMatterNodeId(node);
  if (!matterNodeId) {
    return false;
  }
  return deviceInfoAdapter.writeDeviceName(matterNodeId, name);
}

/**
 * Reads a node's firmware version over the Matter fabric.
 *
 * Only pure-Matter nodes need this: they have no cloud `firmwareVersion`, and
 * nothing is persisted when the node was commissioned by another controller or
 * the app was reinstalled.
 * @param matterNodeId - Operational id of the node to read
 * @returns Version for display, or undefined when the device does not answer
 */
export function readMatterSoftwareVersion(
  matterNodeId: string,
): Promise<string | undefined> {
  return deviceInfoAdapter.readFirmwareVersion(matterNodeId);
}
