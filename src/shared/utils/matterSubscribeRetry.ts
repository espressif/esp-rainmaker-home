/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFUser } from "@store";

/**
 * Per-user registry of single-node subscription retry helpers. The base SDK's
 * `subscribeToAllNodes` runs once during the post-login pipeline and does not
 * retry per-node failures — when a Matter node's `matter_local` transport is
 * registered AFTER that pass (e.g. because mDNS resolution / CHIP CASE
 * handshake landed late), the matter subscription channel logs
 * `No available subscription channels for node …` and the node stays silent.
 *
 * The CDF user adaptor (`transformToESPCDFUser`) writes a closure-bound
 * retry helper into this registry so feature code can re-trigger a
 * single-node subscribe once a channel becomes available — without breaching
 * the layering rule that forbids features from importing sdk-adaptors.
 *
 * The map is weak so logged-out / replaced user instances are eligible for
 * GC (the closure can hold significant state — sdk node refs, callbacks).
 */
/**
 * Optional payload allowing callers to bypass the helper's internal node
 * lookup. Required for nodes that were added to the CDF store AFTER the
 * post-login `subscribeToAllNodes` pass — typically a freshly-commissioned
 * matter device — because the matter user adaptor only retains references
 * to the node list it received during that initial pass. Pass the raw
 * ESPRMNode (typed `unknown` here to avoid a hard SDK dependency in the
 * shared layer) so the retry closure can subscribe without a re-fetch.
 */
export interface MatterSubscribeRetryOptions {
  rawNode?: unknown;
}

type MatterSubscribeRetryFn = (
  nodeId: string,
  options?: MatterSubscribeRetryOptions,
) => Promise<void>;

const cdfUserRetrySubscribeRegistry: WeakMap<
  ESPCDFUser,
  MatterSubscribeRetryFn
> = new WeakMap();

/**
 * Registers a retry helper for the given user. Called by the CDF user
 * adaptor immediately after the user instance is constructed, so the helper
 * is available before the post-login pipeline runs.
 *
 * Replacing the helper for the same user instance is allowed (last write
 * wins) — useful if the adaptor refreshes its closure after a transport
 * provider swap.
 * @param user - The CDF user instance.
 * @param retry - Helper that re-attempts subscribe for a single node id.
 */
export function registerSubscribeRetryForUser(
  user: ESPCDFUser,
  retry: MatterSubscribeRetryFn,
): void {
  cdfUserRetrySubscribeRegistry.set(user, retry);
}

/**
 * Triggers a per-node subscription retry for `nodeId` on the supplied user.
 * Used by the Matter local discovery layer to recover from the post-login
 * race where the initial `subscribeToAllNodes` runs before a node's
 * `matter_local` transport is registered, AND from the post-commission flow
 * where a brand-new node lands in the CDF store after that initial pass.
 *
 * Safe to call any number of times: channel-level subscription is
 * idempotent, and the helper no-ops when no retry was registered (e.g.
 * the user adaptor never ran `subscribeToNodeUpdates`).
 * @param user - The CDF user whose subscription should be retried.
 * @param nodeId - The CDF node id to retry.
 * @param options - Optional payload (e.g. `rawNode`) used when the node was
 *   not part of the original subscribe-all snapshot.
 */
export async function retrySubscribeForNodeId(
  user: ESPCDFUser | null | undefined,
  nodeId: string,
  options?: MatterSubscribeRetryOptions,
): Promise<void> {
  if (!user) return;
  const retry = cdfUserRetrySubscribeRegistry.get(user);
  if (!retry) return;
  await retry(nodeId, options);
}
