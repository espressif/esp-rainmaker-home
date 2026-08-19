/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFNodeTransport,
  type ESPCDFNode,
  type ESPCDFTransportConfig,
} from "@store";
import {
  ESPRM_LOCAL_CONTROL_SERVICE,
  ESPRM_LOCAL_CONTROL_TYPE_PARAM_TYPE,
  ESPRM_LOCAL_CONTROL_POP_PARAM_TYPE,
} from "@shared/utils/constants";
import type { LocalTransportConfig } from "./types";

/**
 * Resolves a node's local-control (LAN) signaling parameters, or null when the
 * node is not locally reachable. The base URL comes from the node's discovered
 * LOCAL transport; the security type + POP come from its `esp.service.local_control`
 * service params (mirrors the native app's local-session setup).
 * Prefers the live, discovery-tracked `registeredTransports` (so LAN availability
 * updates reactively without an app restart) and falls back to the node's static
 * `availableTransports` — mirroring `resolveNodeTransportsForReachability`.
 * @param node - The CDF node (may be null/undefined).
 * @param registeredTransports - Live transports from `subscriptionStore.registeredTransports[nodeId]`.
 * @returns Local transport config, or null when no LAN transport is available.
 */
export function getLocalTransport(
  node: ESPCDFNode | null | undefined,
  registeredTransports?: Partial<Record<string, ESPCDFTransportConfig>> | null
): LocalTransportConfig | null {
  const transports = registeredTransports ?? node?.availableTransports;
  const baseUrl = transports?.[ESPCDFNodeTransport.LOCAL]?.metadata?.baseUrl;
  if (!baseUrl) return null;

  const service = node?.services?.find(
    (s) => s.type === ESPRM_LOCAL_CONTROL_SERVICE
  );
  let securityType = 0;
  let pop = "";
  for (const param of service?.params ?? []) {
    if (param.type === ESPRM_LOCAL_CONTROL_TYPE_PARAM_TYPE) {
      securityType = Number(param.value) || 0;
    } else if (param.type === ESPRM_LOCAL_CONTROL_POP_PARAM_TYPE) {
      pop = param.value != null ? String(param.value) : "";
    }
  }

  return { baseUrl: String(baseUrl), securityType, pop };
}
