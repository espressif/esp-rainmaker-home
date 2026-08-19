/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ON_NETWORK_VERSION_PROBE_TIMEOUT_MS,
  RMAKER_LOCAL_CTRL_CAP_NO_POP,
  RMAKER_LOCAL_CTRL_VERSION_ENDPOINT,
  RMAKER_LOCAL_CTRL_VERSION_KEY,
} from "@shared/utils/constants";

/** Security details a RMNeo node reports on its version endpoint. */
export interface OnNetworkSecurityInfo {
  /** Registered protocomm security scheme (1 = SEC1, 2 = SEC2/SRP6a). */
  secVersion: number;
  /** Whether the device expects a PoP before accepting the challenge. */
  popRequired: boolean;
  /** Active endpoint sets, e.g. `["ch_resp"]` or `["get_params", …]`. */
  capabilities: string[];
}

/**
 * Probes a RMNeo node's `rmaker_local_ctrl/version` endpoint for its security
 * details.
 *
 * Unlike the legacy `_esp_rmaker_chal_resp._tcp` service — which advertises
 * `sec_version` and `pop_required` in mDNS TXT records — the shared
 * `_esp_rmaker_ctrl._tcp` instance publishes only `node_id` and `cap`, and
 * serves the security details here instead. The endpoint sits in front of the
 * protocomm session (it answers any payload, unencrypted), so a plain HTTP POST
 * is enough; no local-control session is needed yet.
 *
 * PoP is derived the same way the network-provisioning capability convention
 * does it: required unless the response's `cap` array contains `no_pop`. SEC2
 * always authenticates with a PoP, so `no_pop` is only honoured for SEC1.
 * @param host - Numeric host from the mDNS SRV record.
 * @param port - Port from the mDNS SRV record.
 * @param timeoutMs - Probe budget; defaults to
 *   {@link ON_NETWORK_VERSION_PROBE_TIMEOUT_MS}.
 * @returns The parsed security info, or `null` when the device did not answer
 *   with a usable `sec_ver` (caller should treat the node as not provisionable
 *   rather than guessing a scheme).
 */
export async function probeOnNetworkSecurity(
  host: string,
  port: number,
  timeoutMs: number = ON_NETWORK_VERSION_PROBE_TIMEOUT_MS,
): Promise<OnNetworkSecurityInfo | null> {
  const url = `http://${host}:${port}/${RMAKER_LOCAL_CTRL_VERSION_ENDPOINT}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: "---",
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(
        `[onNetworkVersionProbe] ${url} responded ${response.status}`,
      );
      return null;
    }

    const json = (await response.json()) as Record<string, unknown>;
    const info = json?.[RMAKER_LOCAL_CTRL_VERSION_KEY] as
      | Record<string, unknown>
      | undefined;

    const secVersion = Number(info?.sec_ver);
    if (!Number.isFinite(secVersion)) {
      console.warn(
        `[onNetworkVersionProbe] ${url} returned no usable sec_ver`,
        JSON.stringify(json),
      );
      return null;
    }

    const capabilities = Array.isArray(info?.cap)
      ? (info.cap as unknown[]).filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];

    return {
      secVersion,
      // SEC2 (SRP6a) always authenticates with a PoP; only SEC1 may opt out.
      popRequired:
        secVersion !== 1 || !capabilities.includes(RMAKER_LOCAL_CTRL_CAP_NO_POP),
      capabilities,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[onNetworkVersionProbe] ${url} probe failed: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
