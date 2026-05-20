/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFProvisioningDevice,
  type ESPCDFOnNetworkDevice,
  type ESPCDFProvisioningDeviceOperations,
} from "@store";

/**
 * Transport string set on the `ESPCDFProvisioningDevice` instances we build
 * for on-network targets. Distinct from `"ble"` / `"softap"` so downstream
 * code can disambiguate at a glance, but the canonical "is this on-network?"
 * check goes through `device.checkOnNetworkProvisioning()` (which reads from
 * `operations`) — never via raw string comparison.
 */
export const ON_NETWORK_TRANSPORT = "on_network";

/**
 * Build an `ESPCDFProvisioningDevice` from an mDNS-discovered on-network
 * device record.
 *
 * The on-network flow doesn't go through the SDK's BLE/SoftAP provision
 * adapter — it talks to the device directly over LAN HTTP via
 * `ESPLocalControlAdapter` (in `addOnNetworkDeviceProvision`). So most of the
 * `ESPCDFProvisioningDeviceOperations` surface is irrelevant here.
 *
 * The reason we still wrap it as an `ESPCDFProvisioningDevice` is that
 * `useProvision` / `usePOP` already dispatch off `nodeStore.connectedDevice`
 * and `device.checkChallengeResponseSupport()`. Treating an on-network target
 * as just another `ESPCDFProvisioningDevice` lets us:
 *   1. Reuse the same `nodeStore.connectedDevice` slot for all flows (no
 *      separate "isOnNetworkFlow" route params or sibling store fields).
 *   2. Dispatch the flow choice through a uniform device method —
 *      `checkOnNetworkProvisioning()` — mirroring `checkChallengeResponseSupport()`.
 *
 * The unused operations are stubbed to throw a descriptive error, so if any
 * future code path ever tries to call e.g. `setProofOfPossession` on an
 * on-network device we get a loud failure rather than silent wrong behaviour.
 * @param onNetworkDevice - mDNS-discovered device record.
 * @returns A provisioning-device wrapper suitable for `nodeStore.connectedDevice`.
 */
export function buildOnNetworkProvisioningDevice(
  onNetworkDevice: ESPCDFOnNetworkDevice
): ESPCDFProvisioningDevice {
  const notSupported = (op: string) => async (): Promise<never> => {
    throw new Error(
      `[OnNetworkProvisioningDevice] '${op}' is not supported for on-network devices`
    );
  };

  const operations: ESPCDFProvisioningDeviceOperations = {
    connect: notSupported("connect"),
    disconnect: async () => {
      // Best-effort no-op: useProvision / cleanup may call this even on
      // on-network devices; we don't hold any native handle to release here.
    },
    getDeviceCapabilities: notSupported("getDeviceCapabilities"),
    getDeviceVersionInfo: notSupported("getDeviceVersionInfo"),
    setProofOfPossession: notSupported("setProofOfPossession"),
    initializeSession: notSupported("initializeSession"),
    scanWifiList: notSupported("scanWifiList"),
    provision: notSupported("provision"),
    initiateUserNodeMapping: notSupported("initiateUserNodeMapping"),
    verifyUserNodeMapping: notSupported("verifyUserNodeMapping"),
    setNetworkCredentials: notSupported("setNetworkCredentials"),
    sendData: notSupported("sendData"),
    startAssistedClaiming: notSupported("startAssistedClaiming"),
    /** Always `false` — chal-resp dispatch only applies to BLE/SoftAP flows. */
    checkChallengeResponseSupport: async () => false,
    /** Always `true` — this is the whole point of this wrapper. */
    checkOnNetworkProvisioning: async () => true,
  };

  return new ESPCDFProvisioningDevice({
    name: onNetworkDevice.nodeId,
    transport: ON_NETWORK_TRANSPORT,
    security: onNetworkDevice.secVersion,
    connected: true,
    operations,
    _raw: onNetworkDevice,
  });
}
