/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Marks a CDF group that is Matter-capable but not yet promoted to a fabric. */
export const NEO_MATTER_NEEDS_FABRIC_CONVERSION =
  "NEO_MATTER_NEEDS_FABRIC_CONVERSION";

/** Description returned by the adaptor once the Matter SDK is configured. */
export const NEO_MATTER_DESC_SDK_INITIALIZED =
  "SDK initialized successfully with Neo Matter support";

/** Description returned when a pure Matter node's config PUT carries no message. */
export const NEO_MATTER_DESC_NODE_CONFIG_UPDATED = "Node configuration updated";
