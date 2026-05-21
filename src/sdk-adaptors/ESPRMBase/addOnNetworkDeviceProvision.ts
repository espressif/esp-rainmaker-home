/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPCDFUser,
  ESPCDFNode,
  GroupStoreCallbacks,
  AddOnNetworkDeviceParams,
} from "@store";
import { ESPCDFOnNetworkProgressMessages, ESPCDFProvisionResponseStatus } from "@store";
import {
  ChallengeResponseHelper,
  ESPDevice,
} from "@espressif/rainmaker-base-sdk";
import ESPLocalControlAdapter from "@native-adaptors/implementations/ESPLocalControlAdapter";
import { applyProvisionNodeTimezoneWithRetries } from "@shared/utils/timezone";
import { pollUntilReady } from "@shared/utils/common";
import { ON_NETWORK_DEFAULT_CH_RESP_ENDPOINT } from "@shared/utils/constants";

/**
 * On-network (LAN HTTP) challenge-response provisioning flow.
 *
 * The device is already on the user's Wi-Fi (discovered via mDNS). We never
 * push Wi-Fi credentials. We reuse the existing `ESPLocalControlAdapter`
 * native bridge that already implements the proto-c session handshake at
 * `/esp_local_ctrl/session` (Curve25519 for sec1, SRP6a + POP for sec2),
 * AES-encrypted payloads and HTTP cookie continuity. Steps:
 *   1. `localControlAdapter.connect(nodeId, "http://host:port", sec, pop)`
 *      establishes the secure session with the device.
 *   2. Cloud `initiateUserNodeMapping` issues a request id + challenge.
 *   3. `localControlAdapter.sendData(nodeId, "ch_resp", base64Payload)` sends
 *      the encrypted challenge over the established session and returns the
 *      device's signed response (also base64-encoded; encryption handled
 *      transparently inside the native module).
 *   4. Cloud `verifyUserNodeMapping` confirms the mapping.
 *   5. Send a "disable challenge-response" command to the device so future
 *      LAN HTTP requests don't go through the chal-resp endpoint (mirrors
 *      what the iOS / Android native apps do — best-effort, non-blocking).
 *   6. Poll cloud for the node, set timezone, attach to group store.
 */
const LOG_PREFIX = "[addOnNetworkDeviceProvision]";

/**
 * Hand-rolled protobuf bytes for the "disable challenge-response" command.
 *
 * The current `@espressif/rainmaker-base-sdk` proto enum stops at
 * `TypeRespGetNodeID = 3`, so we can't construct a `RMakerMiscPayload` with
 * `TypeCmdDisableChalResp = 4` via the SDK's generated classes. Native iOS /
 * Android apps use newer proto definitions; we replicate the wire format
 * directly here. The serialized message is deterministic and trivial:
 *
 * ```
 * RMakerMiscPayload {
 *   msg     = 4 (TypeCmdDisableChalResp)
 *   status  = 0 (Success)
 *   payload = oneof.cmdDisableChalRespPayload (empty message)
 * }
 * ```
 *
 * Wire bytes:
 *   tag 1 (varint, msg=4)                      → 0x08 0x04
 *   tag 2 (varint, status=0)                   → 0x10 0x00
 *   tag 14 (length-delimited, empty message)   → 0x72 0x00
 *
 * Total 6 bytes. If/when the SDK adds these enum values we should switch to
 * the generated classes for type safety.
 * @returns Serialized `RMakerMiscPayload` for the disable command.
 */
function buildDisableChalRespPayload(): Uint8Array {
  // 0x08 = (field=1 << 3) | wire-type=0 (varint) — msg field
  // 0x10 = (field=2 << 3) | wire-type=0 (varint) — status field
  // 0x72 = (field=14 << 3) | wire-type=2 (length-delimited) — disable payload
  return new Uint8Array([0x08, 0x04, 0x10, 0x00, 0x72, 0x00]);
}

/**
 * Convert a `Uint8Array` to a base64 string using the React Native runtime's
 * `btoa` (always available on modern Hermes). Kept inline so we don't pull in
 * a heavyweight buffer/polyfill dependency for one trivial transform.
 * @param bytes - Bytes to encode.
 * @returns Base64-encoded string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  // eslint-disable-next-line no-undef
  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(bytes).toString("base64");
}

/**
 * Decode a base64 string from the native bridge into raw bytes.
 * @param base64 - Base64 input from the native side.
 * @returns Decoded bytes.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // eslint-disable-next-line no-undef
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Adaptor entry point invoked by `user.addOnNetworkDevice` (via the user
 * operations layer wired in `transformToESPCDFUser`).
 * @param user - The CDF user; used for cloud calls + node fetch.
 * @param params - Discovered device, target group id, and (optional) POP.
 * @param callbacks - GroupStoreCallbacks for store updates after success.
 * @returns The provisioned `ESPCDFNode` or `null` on failure.
 */
export async function addOnNetworkDeviceProvision(
  user: ESPCDFUser,
  params: AddOnNetworkDeviceParams,
  callbacks: GroupStoreCallbacks
): Promise<ESPCDFNode | null> {
  const { device, groupId, pop, onProgress } = params;

  console.log(
    `${LOG_PREFIX} START`,
    JSON.stringify({
      nodeId: device.nodeId,
      host: device.host,
      port: device.port,
      secVersion: device.secVersion,
      popRequired: device.popRequired,
      chRespEndpoint: device.chRespEndpoint,
      groupId,
      hasPop: !!pop,
    })
  );

  if (device.popRequired && !pop) {
    throw new Error("POP is required for this device");
  }

  const deviceName = device.nodeId || device.serviceName;
  const baseUrl = `http://${device.host}:${device.port}`;
  const endpoint =
    device.chRespEndpoint && device.chRespEndpoint.length > 0
      ? device.chRespEndpoint
      : ON_NETWORK_DEFAULT_CH_RESP_ENDPOINT;
  // Strip a leading slash so the native module treats it as a path segment.
  const normalizedEndpoint = endpoint.replace(/^\//, "");

  // Cloud-only ESPDevice stub for `initiateUserNodeMapping` /
  // `verifyUserNodeMapping`. These hit RainMaker cloud APIs and don't touch
  // the provision adapter, so an in-memory stub is safe.
  const cloudDevice = new ESPDevice({
    name: deviceName,
    transport: "on_network",
    security: device.secVersion,
  });

  // Captured by the LAN-HTTP block; consumed by the post-mapping cloud poll
  // to fetch the freshly-mapped node.
  let verifiedNodeId: string | null = null;

  // ─── Step 1 — Establish proto-c session with the device ────────────────
  // ESPLocalControlAdapter.connect(...) does the handshake at
  // `/esp_local_ctrl/session` and stores the session cookie + AES key.
  // (Same code path the post-login local-control feature already uses.)
  onProgress?.({
    status: ESPCDFProvisionResponseStatus.ON_PROGRESS,
    description: ESPCDFOnNetworkProgressMessages.INITIATING_NODE_ASSOCIATION,
  });
  console.log(
    `${LOG_PREFIX} Step 1: ESPLocalControlAdapter.connect(${deviceName} @ ${baseUrl}, sec=${device.secVersion})`
  );
  try {
    // Pass `""` (empty string) for missing POP — never `undefined`/`null`.
    // The underlying Android `Security1(pop).processStep0Response(...)`
    // dereferences `proofOfPossession.length` without a null guard, NPEing
    // with "Attempt to get length of null array" when constructed with null
    // POP. An empty-string POP routes through the library's
    // `proofOfPossession.length > 0` check correctly (skips the POP-XOR step,
    // bare Curve25519 ECDH) — matching the firmware's `pop_required: false`
    // path. Same defensive pattern we already use on the iOS module.
    await ESPLocalControlAdapter.connect(
      deviceName,
      baseUrl,
      device.secVersion,
      pop ?? "",
      undefined
    );
    console.log(`${LOG_PREFIX} Step 1 OK (session established)`);
  } catch (e) {
    console.error(
      `${LOG_PREFIX} Step 1 FAILED (connect/session):`,
      e instanceof Error ? e.message : e
    );
    throw e;
  }

  // ─── Step 2 — Ask cloud to issue a challenge ───────────────────────────
  console.log(
    `${LOG_PREFIX} Step 2: initiateUserNodeMapping with groupId=${groupId}`
  );
  let mappingResponse: { challenge?: string; request_id?: string };
  try {
    mappingResponse = await cloudDevice.initiateUserNodeMapping(
      groupId ? { group_id: groupId } : {}
    );
    console.log(
      `${LOG_PREFIX} Step 2 OK:`,
      JSON.stringify({
        hasChallenge: !!mappingResponse?.challenge,
        hasRequestId: !!mappingResponse?.request_id,
      })
    );
  } catch (e) {
    console.error(
      `${LOG_PREFIX} Step 2 FAILED (cloud initiateUserNodeMapping):`,
      e instanceof Error ? e.message : e
    );
    throw e;
  }
  const challenge = mappingResponse?.challenge as string | undefined;
  const requestId = mappingResponse?.request_id as string | undefined;
  if (!challenge || !requestId) {
    throw new Error("Cloud did not return a challenge / request id");
  }

  // ─── Step 3 — Encrypted send to the device's chal-resp endpoint ────────
  onProgress?.({
    status: ESPCDFProvisionResponseStatus.ON_PROGRESS,
    description: ESPCDFOnNetworkProgressMessages.SENDING_CHALLENGE_TO_DEVICE,
  });
  const challengePayload =
    ChallengeResponseHelper.createChallengeRequest(challenge);
  const challengeBase64 = uint8ArrayToBase64(challengePayload);
  console.log(
    `${LOG_PREFIX} Step 3: sendData to "${normalizedEndpoint}" (${challengePayload.length} bytes pre-encryption)`
  );
  let responseBase64: string;
  try {
    responseBase64 = await ESPLocalControlAdapter.sendData(
      deviceName,
      normalizedEndpoint,
      challengeBase64
    );
    console.log(
      `${LOG_PREFIX} Step 3 OK (response ${responseBase64.length} chars base64)`
    );
  } catch (e) {
    console.error(
      `${LOG_PREFIX} Step 3 FAILED (sendData):`,
      e instanceof Error ? e.message : e
    );
    throw e;
  }
  const responseBytes = base64ToUint8Array(responseBase64);
  const parsed = ChallengeResponseHelper.parseAndValidateDeviceResponse(
    responseBytes
  );
  console.log(
    `${LOG_PREFIX} Step 3 parse result:`,
    JSON.stringify({
      success: parsed.success,
      nodeId: parsed.nodeId,
      hasSignedChallenge: !!parsed.signedChallenge,
      error: parsed.error,
    })
  );
  if (!parsed.success || !parsed.nodeId || !parsed.signedChallenge) {
    throw new Error(parsed.error || "Invalid challenge response from device");
  }
  verifiedNodeId = parsed.nodeId;

  // ─── Step 4 — Verify with cloud (this creates the mapping) ─────────────
  onProgress?.({
    status: ESPCDFProvisionResponseStatus.ON_PROGRESS,
    description: ESPCDFOnNetworkProgressMessages.VERIFYING_NODE_ASSOCIATION,
  });
  console.log(`${LOG_PREFIX} Step 4: verifyUserNodeMapping`);
  const verifyBody: Record<string, string> = {
    request_id: requestId,
    challenge_response: parsed.signedChallenge,
    node_id: parsed.nodeId,
  };
  if (groupId) {
    verifyBody.group_id = groupId;
  }
  try {
    await cloudDevice.verifyUserNodeMapping(verifyBody);
    console.log(`${LOG_PREFIX} Step 4 OK`);
  } catch (e) {
    console.error(
      `${LOG_PREFIX} Step 4 FAILED (cloud verifyUserNodeMapping):`,
      e instanceof Error ? e.message : e
    );
    throw e;
  }

  // ─── Step 5 — Tell the device to disable its chal-resp endpoint ────────
  // Best-effort, non-blocking: mirrors the iOS/Android native apps. The
  // device will stop accepting challenge requests on this endpoint after
  // it's been claimed (no point keeping it open). Failures here don't break
  // the user flow — the cloud-side mapping is already in place.
  console.log(
    `${LOG_PREFIX} Step 5: sending DisableChalResp command to "${normalizedEndpoint}"`
  );
  try {
    const disableBytes = buildDisableChalRespPayload();
    const disableBase64 = uint8ArrayToBase64(disableBytes);
    await ESPLocalControlAdapter.sendData(
      deviceName,
      normalizedEndpoint,
      disableBase64
    );
    console.log(`${LOG_PREFIX} Step 5 OK (disable command sent)`);
  } catch (e) {
    // Swallow — the device might already be tearing down its chal-resp
    // service after the successful verification, so timeouts / connection
    // resets here are expected and harmless.
    console.warn(
      `${LOG_PREFIX} Step 5 disable command failed (non-blocking):`,
      e instanceof Error ? e.message : e
    );
  }

  onProgress?.({
    status: ESPCDFProvisionResponseStatus.SUCCEED,
    description: ESPCDFOnNetworkProgressMessages.USER_NODE_MAPPING_SUCCEED,
    data: { nodeId: verifiedNodeId },
  });

  // ─── Step 6 — Fetch node + group attachment ───────────────────────────
  // Mirrors `addDeviceProvision` so the freshly-mapped node lands in the
  // store with timezone applied.
  const nodeId = verifiedNodeId;
  let node: ESPCDFNode;
  try {
    let pollAttempt = 0;
    const pollResult = await pollUntilReady(
      async () => {
        pollAttempt++;
        try {
          const n = await user.getNodeDetails(nodeId);
          return n || null;
        } catch (e) {
          console.error(
            `${LOG_PREFIX} Poll attempt ${pollAttempt}: getNodeDetails failed`,
            e instanceof Error ? e.message : e
          );
          return null;
        }
      },
      {
        maxAttempts: 8,
        intervalMs: 2000,
        label: "Waiting for node after on-network provision",
      }
    );
    if (!pollResult.success || !pollResult.data) {
      console.error(
        `${LOG_PREFIX} Node not available after ${pollAttempt} attempts - nodeId=${nodeId}`
      );
      return null;
    }
    node = pollResult.data;
  } catch (pollError) {
    console.error(`${LOG_PREFIX} Failed to fetch node:`, pollError);
    return null;
  }

  try {
    node = await applyProvisionNodeTimezoneWithRetries(
      user,
      nodeId,
      node,
      (id) => user.getNodeDetails(id)
    );
  } catch (tzError) {
    console.error(
      `${LOG_PREFIX} Timezone setup failed (non-blocking):`,
      tzError
    );
  }

  callbacks.addNodesToGroup(groupId, [node]);
  return node;
}
