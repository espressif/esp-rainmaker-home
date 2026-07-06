/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPNodeUpdateData } from "@espressif/rmng-base-sdk";

let hybridSubscribeUpdateHandler:
  | ((update: ESPNodeUpdateData) => void)
  | null = null;

/** Registers the active node-update handler (set by the Matter user wrapper; pass null to clear). */
export function setRmngHybridSubscribeUpdateHandler(
  handler: ((update: ESPNodeUpdateData) => void) | null,
): void {
  hybridSubscribeUpdateHandler = handler;
}

/** Returns the registered node-update handler, or null if none is set. */
export function getRmngHybridSubscribeUpdateHandler():
  | ((update: ESPNodeUpdateData) => void)
  | null {
  return hybridSubscribeUpdateHandler;
}
