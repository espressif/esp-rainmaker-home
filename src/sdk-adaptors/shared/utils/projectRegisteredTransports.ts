/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFTransportConfig } from "@store";

/**
 * Minimal shape of a raw SDK node this helper touches. Both the RMNeo
 * (`ESPRMNeoNode`) and RM (`ESPRMNode`) raw nodes expose a mutable
 * `availableTransports` map keyed by transport mode.
 */
interface RawTransportNode {
    availableTransports?: Record<string, unknown>;
}

/**
 * Re-applies the CDF store's registered (locally-discovered) transports onto a
 * freshly-built raw SDK node so the SDK's transport handler can route on them
 * immediately.
 *
 * Why this is needed: `subscriptionStore.registeredTransports` is the durable
 * source of truth for local discovery — it survives node-instance replacement
 * and drives the "available on WLAN" badge. The live raw node's
 * `availableTransports` does NOT: every fresh transform (from a home sync or a
 * config / ncfg-version refresh) seeds only the cloud transport. The SDK routes
 * param set/get on this raw node's `availableTransports` via
 * `delegatedTransportHandler` (RMNeo `node.setParams`; RM
 * `ESPRMDeviceParam.setValue` → `nodeRef.deref()`), NOT on the CDF copy — so
 * without re-projecting, a new node instance silently routes over the cloud
 * (despite the badge) until a discovery "found" re-fires onto it, which
 * post-provision / post-refresh may never happen.
 *
 * `Object.assign` merges the registered entries into the existing transport map
 * (additive — it never replaces the self-managed cloud transport, and the
 * registry only ever holds discovery transports). This is equivalent to calling
 * the node's `addTransport` per entry — that method is itself just this
 * assignment — and works for RM's `ESPRMNode`, which exposes no `addTransport`.
 *
 * Routing is only affected for modes in the node's `transportOrder` (RMNeo / RM
 * `local`). For Matter nodes the registered `matter_local` key is not in the
 * transport order (`[local, cloud]`) and matter param writes use a separate
 * controller invoke, so this is inert there — harmless, not a fix.
 * @param rawNode - The freshly-built raw SDK node to project onto.
 * @param registeredTransports - The node's entry from
 *   `subscriptionStore.getRegisteredTransportsSnapshot()` (type → config map).
 */
export function projectRegisteredTransportsOntoRawNode(
    rawNode: unknown,
    registeredTransports:
        | Partial<Record<string, ESPCDFTransportConfig>>
        | undefined,
): void {
    const node = rawNode as RawTransportNode | undefined;
    if (!node?.availableTransports || !registeredTransports) return;
    Object.assign(node.availableTransports, registeredTransports);
}
