/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFUser } from "@store";

/**
 * Per-user registry of one-shot Matter attribute-read helpers. Mirrors the
 * structure of {@link ./matterSubscribeRetry} but instead of re-trying a
 * subscribe, the helper iterates every UI-relevant matter param on a node,
 * fires an explicit `ESPMatterControlAdapter.read` per param, and feeds
 * each result back through the same handler the matter subscription uses —
 * so the existing `rewriteMatterShadowPayload` + CDF `handleNodeParamsChanged`
 * pipeline routes the value to the UI without a special-case path.
 *
 * Why this exists:
 *   The CHIP-Android subscribe pipeline pushes an initial `ReportData`
 *   immediately on subscription establishment, so the device-details screen
 *   often paints with real values on mount. The CHIP-iOS / `MTRBaseDevice`
 *   subscribe pipeline does NOT guarantee an initial report — the official
 *   `esp-rainmaker-ios` app compensates by calling `cluster.readAttributeXxx`
 *   for every matter cell on display BEFORE subscribing (see
 *   `DeviceViewController+UIWorker.swift` `getCurrentLevelValues()` /
 *   `getCurrentSaturationValue()` etc.). We mirror that pattern here so the
 *   matter device-details screen behaves identically on both platforms
 *   regardless of whether the subscription has delivered a frame yet.
 *
 * The map is weak so logged-out / replaced user instances are eligible for
 * GC (the closure can hold significant state — sdk node refs, dispatch
 * handlers).
 */
type MatterAttributeReadFn = (nodeId: string) => Promise<void>;

const cdfUserAttributeReadRegistry: WeakMap<
  ESPCDFUser,
  MatterAttributeReadFn
> = new WeakMap();

/**
 * Registers an attribute-read helper for the given user. Called by the
 * matter CDF user adaptor when `subscribeToNodeUpdates` runs, so the helper
 * is available before any control screen requests a read.
 *
 * Replacing the helper for the same user instance is allowed (last write
 * wins) — useful if the adaptor refreshes its closure after a transport
 * provider swap.
 * @param user - The CDF user instance.
 * @param read - Helper that performs explicit attribute reads for every
 *               UI-relevant matter param on `nodeId` and dispatches each
 *               result through the subscription update handler.
 */
export function registerAttributeReadForUser(
  user: ESPCDFUser,
  read: MatterAttributeReadFn,
): void {
  cdfUserAttributeReadRegistry.set(user, read);
}

/**
 * Triggers an explicit read of every UI-relevant matter param on `nodeId`
 * for the supplied user. Safe to call any number of times: the matter SDK
 * and subscription pipeline are idempotent under repeated `read → dispatch`,
 * and the helper no-ops when no read helper was registered (e.g. the user
 * adaptor never ran `subscribeToNodeUpdates`, or the node is not in the
 * cold-start subscribe-all snapshot).
 *
 * Errors during individual attribute reads are swallowed inside the helper
 * (logged) — one unsupported attribute on a vendor FW must not abort the
 * rest of the panel refresh.
 * @param user   - The CDF user whose node should be read.
 * @param nodeId - The CDF node id to read.
 */
export async function readAttributesForNodeId(
  user: ESPCDFUser | null | undefined,
  nodeId: string,
): Promise<void> {
  if (!user) return;
  const read = cdfUserAttributeReadRegistry.get(user);
  if (!read) return;
  await read(nodeId);
}
