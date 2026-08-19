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
import {
  ESPCDFOnNetworkProgressMessages,
  ESPCDFProvisionResponseStatus,
} from "@store";
import { ESPDevice } from "@espressif/rainmaker-neo-base-sdk";
import ESPLocalControlAdapter from "@native-adaptors/implementations/ESPLocalControlAdapter";
import {
  applyProvisionNodeTimezoneWithRetries,
  markProvisionTimezoneFailed,
} from "@shared/utils/timezone";
import { pollUntilReady } from "@shared/utils/common";
import {
  ON_NETWORK_DEFAULT_CH_RESP_ENDPOINT,
  RMAKER_LOCAL_CTRL_SESSION_ENDPOINT,
  RMAKER_LOCAL_CTRL_VERSION_ENDPOINT,
  RMAKER_LOCAL_CTRL_VERSION_KEY,
} from "@shared/utils/constants";
import {
  createChallengeRequest,
  createDisableChalRespRequest,
  parseDeviceResponse,
  validateChallengeResponse,
} from "@shared/utils/rmakerChalRespProto";

/**
 * On-network (LAN HTTP) challenge-response provisioning for RainMaker Neo.
 *
 * The device is already on the user's Wi-Fi, discovered on the shared
 * `_esp_rmaker_ctrl._tcp` instance with `ch_resp` in its `cap` TXT record.
 * We never push Wi-Fi credentials — this is user-node association only, i.e.
 * the Neo BLE/SoftAP challenge-response flow minus the set-network-credentials
 * step, carried over LAN HTTP instead of a provisioning transport.
 *
 * Steps:
 *   1. `localControlAdapter.connect(...)` establishes the protocomm session.
 *      Unlike the classic adaptor this targets `rmaker_local_ctrl/session`
 *      (passed as session options), since RMNeo firmware serves the shared
 *      instance's own protocomm endpoints. SEC1 (with or without PoP) and SEC2
 *      (SRP6a, username `wifiprov`) are supported; security 0 is not.
 *   2. Cloud `initiateUserNodeMapping` issues a request id + challenge.
 *   3. `sendData(nodeId, "ch_resp", …)` sends the encrypted challenge over the
 *      established session and returns the device's signed response.
 *   4. Cloud `verifyUserNodeMapping` confirms the mapping.
 *   5. Best-effort `TypeCmdDisableChalResp` so the device retires the endpoint.
 *   6. Poll cloud for the node, apply timezone, attach to the group store.
 *
 * Mirrors the classic `ESPRMBase/addOnNetworkDeviceProvision` in shape, but the
 * Neo cloud takes `groupId` as a positional argument on both mapping calls and
 * the challenge-response codec comes from the app (the Neo SDK does not export
 * its helper — see `@shared/utils/rmakerChalRespProto`).
 *
 * Lives next to `provisionHelpers.ts` (BLE/SoftAP `provisionDevice`) so Neo
 * provision entry points share the same helpers layout.
 */
const LOG_PREFIX = "[rmneo:onNetworkProvisionHelpers]";

/** Username protocomm SEC2 (SRP6a) authenticates with on RainMaker firmware. */
const SEC2_USERNAME = "wifiprov";

/** Security scheme the shared local-control instance never registers. */
const UNSUPPORTED_SECURITY_VERSION = 0;

/**
 * Session endpoints of the `rmaker_local_ctrl` protocol, so the native module
 * handshakes on the shared instance rather than its legacy default.
 *
 * Taken from the app's own constants rather than the SDK's
 * `RMakerLocalCtrlEndpoint`: these are three frozen wire strings, and reading
 * them locally keeps this flow compiling and working independently of which
 * local SDK build happens to be installed.
 */
const RMAKER_SESSION_OPTIONS = {
  protocol: RMAKER_LOCAL_CTRL_VERSION_KEY,
  sessionPath: RMAKER_LOCAL_CTRL_SESSION_ENDPOINT,
  versionPath: RMAKER_LOCAL_CTRL_VERSION_ENDPOINT,
  versionKey: RMAKER_LOCAL_CTRL_VERSION_KEY,
} as const;

/** Base64-encodes bytes using the RN runtime's `btoa` (Hermes always has it). */
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

/** Decodes a base64 string from the native bridge into raw bytes. */
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
 * Adaptor entry point invoked by `user.addOnNetworkDevice` (wired in
 * `transformToESPCDFUser`).
 * @param user - The CDF user; used for the post-mapping node fetch.
 * @param params - Discovered device, target group id, and (optional) POP.
 * @param callbacks - Store callbacks applied after a successful mapping.
 * @returns The provisioned `ESPCDFNode`, or `null` when the node never appeared
 *   in the cloud after verification.
 */
export async function addOnNetworkDeviceProvision(
  user: ESPCDFUser,
  params: AddOnNetworkDeviceParams,
  callbacks: GroupStoreCallbacks,
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
    }),
  );

  if (device.popRequired && !pop) {
    throw new Error("POP is required for this device");
  }
  if (device.secVersion === UNSUPPORTED_SECURITY_VERSION) {
    // The version endpoint reports 1 or 2; a 0 here means the probe was skipped
    // or the record was built from TXT records that don't apply to this service.
    throw new Error(
      "Security 0 is not supported by the rmaker_local_ctrl service",
    );
  }

  const deviceName = device.nodeId || device.serviceName;
  const baseUrl = `http://${device.host}:${device.port}`;
  const endpoint =
    device.chRespEndpoint && device.chRespEndpoint.length > 0
      ? device.chRespEndpoint
      : ON_NETWORK_DEFAULT_CH_RESP_ENDPOINT;
  // Strip a leading slash so the native module treats it as a path segment.
  const normalizedEndpoint = endpoint.replace(/^\//, "");

  // Cloud-only ESPDevice stub for the mapping calls. These hit RainMaker Neo
  // REST APIs and never touch a provisioning transport, so an in-memory stub is
  // safe — the LAN traffic goes through ESPLocalControlAdapter below.
  const cloudDevice = new ESPDevice({
    name: deviceName,
    transport: "on_network",
    security: device.secVersion,
  });

  // ─── Step 1 — Establish the protocomm session with the device ───────────
  onProgress?.({
    status: ESPCDFProvisionResponseStatus.ON_PROGRESS,
    description: ESPCDFOnNetworkProgressMessages.INITIATING_NODE_ASSOCIATION,
  });
  console.log(
    `${LOG_PREFIX} Step 1: connect(${deviceName} @ ${baseUrl}, sec=${device.secVersion}) on ${RMAKER_SESSION_OPTIONS.sessionPath}`,
  );
  try {
    // Pass `""` (never null/undefined) for a missing POP: Android's
    // `Security1(pop).processStep0Response(...)` dereferences
    // `proofOfPossession.length` without a null guard, and iOS treats a nil POP
    // as "ask the delegate", which would hang with no delegate set. An empty
    // string routes through the library's `length > 0` check and matches the
    // firmware's `no_pop` path.
    await ESPLocalControlAdapter.connect(
      deviceName,
      baseUrl,
      device.secVersion,
      pop ?? "",
      device.secVersion === 2 ? SEC2_USERNAME : undefined,
      RMAKER_SESSION_OPTIONS,
    );
    console.log(`${LOG_PREFIX} Step 1 OK (session established)`);
  } catch (e) {
    console.error(
      `${LOG_PREFIX} Step 1 FAILED (connect/session):`,
      e instanceof Error ? e.message : e,
    );
    throw e;
  }

  // ─── Step 2 — Ask cloud to issue a challenge ───────────────────────────
  console.log(`${LOG_PREFIX} Step 2: initiateUserNodeMapping(${groupId})`);
  let challenge: string | undefined;
  let requestId: string | undefined;
  try {
    const mappingResponse = (await cloudDevice.initiateUserNodeMapping(
      groupId,
      {},
    )) as { challenge?: string; request_id?: string };
    challenge = mappingResponse?.challenge;
    requestId = mappingResponse?.request_id;
    console.log(
      `${LOG_PREFIX} Step 2 OK:`,
      JSON.stringify({ hasChallenge: !!challenge, hasRequestId: !!requestId }),
    );
  } catch (e) {
    console.error(
      `${LOG_PREFIX} Step 2 FAILED (cloud initiateUserNodeMapping):`,
      e instanceof Error ? e.message : e,
    );
    throw e;
  }
  if (!challenge || !requestId) {
    throw new Error("Cloud did not return a challenge / request id");
  }

  // ─── Step 3 — Encrypted send to the device's ch_resp endpoint ───────────
  onProgress?.({
    status: ESPCDFProvisionResponseStatus.ON_PROGRESS,
    description: ESPCDFOnNetworkProgressMessages.SENDING_CHALLENGE_TO_DEVICE,
  });
  const challengePayload = createChallengeRequest(challenge);
  console.log(
    `${LOG_PREFIX} Step 3: sendData to "${normalizedEndpoint}" (${challengePayload.length} bytes pre-encryption)`,
  );
  let responseBase64: string;
  try {
    responseBase64 = await ESPLocalControlAdapter.sendData(
      deviceName,
      normalizedEndpoint,
      uint8ArrayToBase64(challengePayload),
    );
    console.log(
      `${LOG_PREFIX} Step 3 OK (response ${responseBase64.length} chars base64)`,
    );
  } catch (e) {
    console.error(
      `${LOG_PREFIX} Step 3 FAILED (sendData):`,
      e instanceof Error ? e.message : e,
    );
    throw e;
  }

  const parsed = parseDeviceResponse(base64ToUint8Array(responseBase64));
  console.log(
    `${LOG_PREFIX} Step 3 parse result:`,
    JSON.stringify({
      success: parsed.success,
      nodeId: parsed.nodeId,
      hasSignedChallenge: !!parsed.signedChallenge,
      error: parsed.error,
    }),
  );
  if (!validateChallengeResponse(parsed)) {
    throw new Error(parsed.error || "Invalid challenge response from device");
  }
  const verifiedNodeId = parsed.nodeId!;

  // ─── Step 4 — Verify with cloud (this creates the mapping) ─────────────
  onProgress?.({
    status: ESPCDFProvisionResponseStatus.ON_PROGRESS,
    description: ESPCDFOnNetworkProgressMessages.VERIFYING_NODE_ASSOCIATION,
  });
  console.log(`${LOG_PREFIX} Step 4: verifyUserNodeMapping`);
  try {
    await cloudDevice.verifyUserNodeMapping(groupId, requestId, {
      challenge_response: parsed.signedChallenge,
      node_id: verifiedNodeId,
    });
    console.log(`${LOG_PREFIX} Step 4 OK`);
  } catch (e) {
    console.error(
      `${LOG_PREFIX} Step 4 FAILED (cloud verifyUserNodeMapping):`,
      e instanceof Error ? e.message : e,
    );
    throw e;
  }

  // ─── Step 5 — Tell the device to disable its ch_resp endpoint ───────────
  // Best-effort and non-blocking: the mapping already exists cloud-side. The
  // device removes the endpoint after flushing this response (and stops a
  // ch_resp-only instance entirely), so a timeout or connection reset here is
  // expected rather than a failure.
  console.log(
    `${LOG_PREFIX} Step 5: sending DisableChalResp to "${normalizedEndpoint}"`,
  );
  try {
    await ESPLocalControlAdapter.sendData(
      deviceName,
      normalizedEndpoint,
      uint8ArrayToBase64(createDisableChalRespRequest()),
    );
    console.log(`${LOG_PREFIX} Step 5 OK (disable command sent)`);
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} Step 5 disable command failed (non-blocking):`,
      e instanceof Error ? e.message : e,
    );
  }

  onProgress?.({
    status: ESPCDFProvisionResponseStatus.SUCCEED,
    description: ESPCDFOnNetworkProgressMessages.USER_NODE_MAPPING_SUCCEED,
    data: { nodeId: verifiedNodeId },
  });

  // ─── Step 6 — Fetch node + group attachment ───────────────────────────
  let node: ESPCDFNode;
  try {
    let pollAttempt = 0;
    const pollResult = await pollUntilReady(
      async () => {
        pollAttempt++;
        try {
          return (await user.getNodeDetails(verifiedNodeId)) || null;
        } catch (e) {
          console.error(
            `${LOG_PREFIX} Poll attempt ${pollAttempt}: getNodeDetails failed`,
            e instanceof Error ? e.message : e,
          );
          return null;
        }
      },
      {
        maxAttempts: 8,
        intervalMs: 2000,
        label: "Waiting for node after on-network provision",
      },
    );
    if (!pollResult.success || !pollResult.data) {
      console.error(
        `${LOG_PREFIX} Node not available after ${pollAttempt} attempts - nodeId=${verifiedNodeId}`,
      );
      return null;
    }
    node = pollResult.data;
  } catch (pollError) {
    console.error(`${LOG_PREFIX} Failed to fetch node:`, pollError);
    return null;
  }

  try {
    const tzResult = await applyProvisionNodeTimezoneWithRetries(
      user,
      verifiedNodeId,
      node,
      (id) => user.getNodeDetails(id),
    );
    node = tzResult.node;
    if (!tzResult.timezoneApplied) {
      console.warn(
        `${LOG_PREFIX} setTimeZone did not succeed (non-blocking); nodeId=`,
        verifiedNodeId,
      );
    }
  } catch (tzError) {
    markProvisionTimezoneFailed(verifiedNodeId);
    console.error(
      `${LOG_PREFIX} Timezone setup failed (non-blocking):`,
      tzError,
    );
  }

  callbacks.addNodesToGroup(groupId, [node]);
  return node;
}
