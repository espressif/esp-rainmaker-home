/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFUser } from "@store";

/**
 * Lets Matter discovery tell the SDK when a node becomes reachable on the
 * local network, without knowing which SDK is active. Only the Neo Matter
 * adaptor registers hooks; for every other SDK these calls do nothing.
 */
export interface MatterLocalNetworkHooks {
  /** Tells the SDK the node was found (`add`) or lost (`remove`) on the LAN. */
  updateReachability(
    matterNodeId: string,
    address: Record<string, unknown>,
    change: "add" | "remove",
  ): Promise<void>;
  /** Reads a hybrid node's local control setup off the device, if needed. */
  readHybridSetupFromDevice(
    matterNodeId: string,
  ): Promise<{ nodeId: string; metadata: Record<string, unknown> } | null>;
}

const hooksByUser = new WeakMap<ESPCDFUser, MatterLocalNetworkHooks>();

/**
 * Registers the SDK's reachability hooks for this user.
 * @param user - The CDF user instance.
 * @param hooks - Hooks for this user's session.
 */
export function registerMatterLocalNetworkHooks(
  user: ESPCDFUser,
  hooks: MatterLocalNetworkHooks,
): void {
  hooksByUser.set(user, hooks);
}

/**
 * Tells the user's SDK that a Matter node was found or lost on the LAN.
 * @param user - The signed-in CDF user.
 * @param matterNodeId - Normalized 16-hex Matter node id.
 * @param address - Host, port and ids from discovery.
 * @param change - `add` when found, `remove` when lost.
 * @returns `true` when the SDK was told, `false` when it has no hooks.
 */
export async function reportMatterReachability(
  user: ESPCDFUser | null | undefined,
  matterNodeId: string,
  address: Record<string, unknown>,
  change: "add" | "remove",
): Promise<boolean> {
  const hooks = user ? hooksByUser.get(user) : undefined;
  if (!hooks) return false;
  await hooks.updateReachability(matterNodeId, address, change);
  return true;
}

/**
 * Reads a hybrid node's local control setup through the user's SDK.
 * @param user - The signed-in CDF user.
 * @param matterNodeId - Normalized 16-hex Matter node id.
 * @returns Node id and setup to save, or null when nothing was read.
 */
export async function readHybridSetupFromDevice(
  user: ESPCDFUser | null | undefined,
  matterNodeId: string,
): Promise<{ nodeId: string; metadata: Record<string, unknown> } | null> {
  const hooks = user ? hooksByUser.get(user) : undefined;
  return hooks ? hooks.readHybridSetupFromDevice(matterNodeId) : null;
}
