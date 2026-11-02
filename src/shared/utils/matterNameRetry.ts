/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Device names that were saved to the cloud but did not reach the device's
 * own Matter name (NodeLabel), and the retries that bring the two back in
 * line. Kept in memory only: after an app restart a missed name is not
 * retried. A name kept in node metadata is given up after the timed retries:
 * another phone's rename does not reach this phone's copy of the metadata
 * live, so a late retry could undo it.
 *
 * A retry writes a name only while it is still the device's current name, so
 * a rename made later (on this phone or another) is never undone. A rename on
 * this phone pauses retries for the node and waits for one already on its
 * way, so its own write is always the last one the device gets.
 *
 * A retry uses the same write as a rename (matterBasicInformation.ts), which
 * reaches the device only through the native adaptor's contract, so this
 * file holds no Matter details.
 */

import type { ESPCDFNode } from "@store";
import { getDeviceDisplayName, getDeviceNameParam } from "./deviceDisplayName";
import {
  canRenameViaMatterNodeLabel,
  renameViaMatterNodeLabel,
} from "./matterBasicInformation";
import { onSessionEnd } from "./userSession";

/** Waits before each automatic retry after a failed write. */
export const MATTER_NAME_RETRY_DELAYS_MS: readonly number[] = [
  10_000, 30_000, 120_000,
];

interface PendingMatterName {
  /** Device on the node whose name was saved. */
  deviceName: string | undefined;
  /** Name saved to the cloud that the device still has to take. */
  name: string;
  /** Kept in node metadata (no name param): given up after the timed retries. */
  namedByMetadata: boolean;
  /** Automatic retries still scheduled. */
  timers: ReturnType<typeof setTimeout>[];
}

type NodeLookup = (nodeId: string) => ESPCDFNode | undefined;

/** Names waiting for their device, by node id. */
const pendingNames = new Map<string, PendingMatterName>();
/** Retry writes on their way to a device, by node id. */
const writesInFlight = new Map<string, Promise<unknown>>();
/** Renames on this phone in progress, by node id; retries wait for them. */
const pausedNodes = new Map<string, number>();
let lookupNode: NodeLookup | undefined;

/**
 * Forgets a waiting name and stops its scheduled retries.
 * @param nodeId - Node the name belongs to
 * @param entry - Only this entry is dropped; a newer one is kept
 */
const dropPending = (nodeId: string, entry?: PendingMatterName): void => {
  const current = pendingNames.get(nodeId);
  if (!current || (entry && current !== entry)) {
    return;
  }
  current.timers.forEach(clearTimeout);
  pendingNames.delete(nodeId);
};

// A signed-out account's names must never be written to a device.
onSessionEnd(() => {
  for (const nodeId of Array.from(pendingNames.keys())) {
    dropPending(nodeId);
  }
  lookupNode = undefined;
});

/**
 * Lets retries find the node as it is now in the store. Registered by the
 * code that watches Matter devices on the local network.
 * @param lookup - Returns the store's current node for an id
 * @returns Function that removes the lookup again
 */
export function registerMatterNameRetryNodeLookup(
  lookup: NodeLookup,
): () => void {
  lookupNode = lookup;
  return () => {
    if (lookupNode === lookup) {
      lookupNode = undefined;
    }
  };
}

/**
 * Keeps a saved name the device did not take and schedules retries; only the
 * newest name per node is kept.
 * @param node - Node that was renamed
 * @param deviceName - Device on the node that was renamed
 * @param name - Name already saved to the cloud
 */
export function queueMatterNameRetry(
  node: ESPCDFNode,
  deviceName: string | undefined,
  name: string,
): void {
  dropPending(node.id);
  const device =
    node.devices?.find((candidate) => candidate.name === deviceName) ??
    node.devices?.[0];
  const entry: PendingMatterName = {
    deviceName,
    name,
    namedByMetadata: !getDeviceNameParam(device),
    timers: [],
  };
  const lastRetry = MATTER_NAME_RETRY_DELAYS_MS.length - 1;
  entry.timers = MATTER_NAME_RETRY_DELAYS_MS.map((delayMs, index) =>
    setTimeout(() => {
      void retryMatterNameNow(node.id).then(() => {
        if (index === lastRetry && entry.namedByMetadata) {
          dropPending(node.id, entry);
        }
      });
    }, delayMs),
  );
  pendingNames.set(node.id, entry);
  console.warn(
    `[matterNameRetry] Matter name not written for node ${node.id}; will retry`,
  );
}

/**
 * Forgets a waiting name, e.g. once a newer rename reached the device.
 * @param nodeId - Node whose waiting name is no longer needed
 */
export function dropMatterNameRetry(nodeId: string): void {
  dropPending(nodeId);
}

/**
 * Holds off retries for a node while it is renamed on this phone, after
 * waiting for a retry write already on its way, so the rename's own write
 * lands last.
 * @param nodeId - Node about to be renamed
 * @returns Function that lets retries run again
 */
export async function pauseMatterNameRetry(
  nodeId: string,
): Promise<() => void> {
  pausedNodes.set(nodeId, (pausedNodes.get(nodeId) ?? 0) + 1);
  await writesInFlight.get(nodeId);
  let resumed = false;
  return () => {
    if (resumed) {
      return;
    }
    resumed = true;
    const count = (pausedNodes.get(nodeId) ?? 1) - 1;
    if (count > 0) {
      pausedNodes.set(nodeId, count);
    } else {
      pausedNodes.delete(nodeId);
    }
  };
}

/**
 * Writes a waiting name now if the device can take it: it is on the local
 * network and the name is still the device's current name. Called after a
 * delay, when the device is found on the local network, and when its Matter
 * link comes up.
 * @param nodeId - Node to retry
 * @returns True when the waiting name was written
 */
export async function retryMatterNameNow(nodeId: string): Promise<boolean> {
  const entry = pendingNames.get(nodeId);
  if (
    !entry ||
    !lookupNode ||
    writesInFlight.has(nodeId) ||
    pausedNodes.has(nodeId)
  ) {
    return false;
  }
  const node = lookupNode(nodeId);
  if (!node) {
    dropPending(nodeId, entry);
    return false;
  }
  if (!canRenameViaMatterNodeLabel(node)) {
    return false;
  }
  const device =
    node.devices?.find((candidate) => candidate.name === entry.deviceName) ??
    node.devices?.[0];
  if (getDeviceDisplayName(device, node).trim() !== entry.name) {
    // Renamed again since, here or on another phone: that rename owns it now.
    dropPending(nodeId, entry);
    return false;
  }

  const write = renameViaMatterNodeLabel(node, entry.name).catch(
    (error: unknown) => {
      console.warn(
        `[matterNameRetry] Matter name retry failed for node ${nodeId}:`,
        error,
      );
      return false;
    },
  );
  writesInFlight.set(nodeId, write);
  try {
    const written = await write;
    if (written) {
      dropPending(nodeId, entry);
    }
    return written;
  } finally {
    writesInFlight.delete(nodeId);
  }
}
