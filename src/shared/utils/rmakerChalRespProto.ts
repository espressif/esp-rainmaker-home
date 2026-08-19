/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codec for the `esp_rmaker_chal_resp` (RainMaker "misc") protobuf used by the
 * challenge-response user-node association flow.
 *
 * Hand-rolled with no dependencies because neither SDK can supply it here:
 * `@espressif/rmneo-base-sdk` deliberately does not re-export its
 * `ChallengeResponseHelper` (it pulls generated `google-protobuf` modules that
 * crash a downstream Metro bundle — see the note in that package's
 * `utils/export.ts`), and the product/shared layer may not import `@espressif/*`
 * at all per the `no-espressif-outside-sdk-layer` architecture rule.
 *
 * Wire contract, from `esp_rmaker_chal_resp.proto` — treat as frozen:
 * - `RMakerMiscPayload`: 1 = msg (varint), 2 = status (varint),
 *   10 = cmdChallengeResponsePayload, 11 = respChallengeResponsePayload,
 *   12 = cmdGetNodeIDPayload, 13 = respGetNodeIDPayload,
 *   14 = cmdDisableChalRespPayload
 * - `CmdCRPayload`:  1 = payload (bytes)
 * - `RespCRPayload`: 1 = payload (bytes), 2 = node_id (string)
 */

/** `RMakerMiscStatus` values. */
export enum RMakerMiscStatus {
  Success = 0,
  Fail = 1,
  InvalidParam = 2,
}

/** `RMakerMiscMsgType` values. `TypeCmdDisableChalResp` is newer than the SDK protos. */
export enum RMakerMiscMsgType {
  TypeCmdChallengeResponse = 0,
  TypeRespChallengeResponse = 1,
  TypeCmdGetNodeID = 2,
  TypeRespGetNodeID = 3,
  TypeCmdDisableChalResp = 4,
}

/** Parsed device answer to a challenge request. */
export interface DeviceChallengeResponse {
  success: boolean;
  nodeId?: string;
  /** Device signature over the challenge, lowercase hex. */
  signedChallenge?: string;
  error?: string;
}

const TAG_FIELD_1_VARINT = 0x08;
const TAG_FIELD_1_BYTES = 0x0a;
const TAG_FIELD_2_VARINT = 0x10;
const TAG_FIELD_10_BYTES = 0x52;
const TAG_FIELD_14_BYTES = 0x72;

const WIRE_TYPE_VARINT = 0;
const WIRE_TYPE_BYTES = 2;

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 127) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining & 0x7f);
  return new Uint8Array(bytes);
}

function readVarint(
  data: Uint8Array,
  index: number,
): { value: number; newIndex: number } {
  let value = 0;
  let shift = 0;
  let byte: number;
  do {
    byte = data[index++];
    value |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return { value, newIndex: index };
}

/** Advances past a field this codec does not read. */
function skipField(data: Uint8Array, index: number, wireType: number): number {
  if (wireType === WIRE_TYPE_VARINT) {
    return readVarint(data, index).newIndex;
  }
  if (wireType === WIRE_TYPE_BYTES) {
    const { value: length, newIndex } = readVarint(data, index);
    return newIndex + length;
  }
  return index + 1;
}

/** Lowercase hex, the encoding the cloud expects for `challenge_response`. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Builds the `TypeCmdChallengeResponse` request carrying the cloud's challenge.
 * @param challenge - Challenge string issued by `initiateUserNodeMapping`.
 * @returns Serialized `RMakerMiscPayload`.
 */
export function createChallengeRequest(challenge: string): Uint8Array {
  const challengeBytes = new TextEncoder().encode(challenge);
  const cmdPayload = concat([
    new Uint8Array([TAG_FIELD_1_BYTES]),
    encodeVarint(challengeBytes.length),
    challengeBytes,
  ]);

  return concat([
    new Uint8Array([TAG_FIELD_1_VARINT]),
    encodeVarint(RMakerMiscMsgType.TypeCmdChallengeResponse),
    new Uint8Array([TAG_FIELD_2_VARINT]),
    encodeVarint(RMakerMiscStatus.Success),
    new Uint8Array([TAG_FIELD_10_BYTES]),
    encodeVarint(cmdPayload.length),
    cmdPayload,
  ]);
}

/**
 * Builds the `TypeCmdDisableChalResp` command, which permanently retires the
 * device's challenge-response endpoint (survives reboots; cleared only by a
 * factory reset).
 * @returns Serialized `RMakerMiscPayload` with an empty disable payload.
 */
export function createDisableChalRespRequest(): Uint8Array {
  return concat([
    new Uint8Array([TAG_FIELD_1_VARINT]),
    encodeVarint(RMakerMiscMsgType.TypeCmdDisableChalResp),
    new Uint8Array([TAG_FIELD_2_VARINT]),
    encodeVarint(RMakerMiscStatus.Success),
    // Empty length-delimited submessage.
    new Uint8Array([TAG_FIELD_14_BYTES, 0x00]),
  ]);
}

/**
 * Parses and validates a device challenge response.
 * @param data - Raw (already decrypted) response bytes.
 * @returns `success: true` with `nodeId` + hex `signedChallenge`, else an error.
 */
export function parseDeviceResponse(
  data: Uint8Array,
): DeviceChallengeResponse {
  try {
    let status = RMakerMiscStatus.Success;
    let respBytes: Uint8Array | undefined;

    let index = 0;
    while (index < data.length) {
      const tag = data[index++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x07;

      if (fieldNumber === 2 && wireType === WIRE_TYPE_VARINT) {
        const read = readVarint(data, index);
        status = read.value as RMakerMiscStatus;
        index = read.newIndex;
        continue;
      }
      if (fieldNumber === 11 && wireType === WIRE_TYPE_BYTES) {
        const { value: length, newIndex } = readVarint(data, index);
        respBytes = data.slice(newIndex, newIndex + length);
        index = newIndex + length;
        continue;
      }
      index = skipField(data, index, wireType);
    }

    if (status !== RMakerMiscStatus.Success) {
      return { success: false, error: "Device returned unsuccessful status" };
    }
    if (!respBytes) {
      return { success: false, error: "Missing challenge response payload" };
    }

    const { payload, nodeId } = parseRespCRPayload(respBytes);
    if (!payload?.length || !nodeId) {
      return {
        success: false,
        error: "Invalid response payload: missing payload or nodeId",
      };
    }

    return { success: true, nodeId, signedChallenge: toHex(payload) };
  } catch (error: unknown) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to parse device response",
    };
  }
}

function parseRespCRPayload(data: Uint8Array): {
  payload?: Uint8Array;
  nodeId?: string;
} {
  let payload: Uint8Array | undefined;
  let nodeId: string | undefined;

  let index = 0;
  while (index < data.length) {
    const tag = data[index++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 1 && wireType === WIRE_TYPE_BYTES) {
      const { value: length, newIndex } = readVarint(data, index);
      payload = data.slice(newIndex, newIndex + length);
      index = newIndex + length;
      continue;
    }
    if (fieldNumber === 2 && wireType === WIRE_TYPE_BYTES) {
      const { value: length, newIndex } = readVarint(data, index);
      nodeId = new TextDecoder().decode(data.slice(newIndex, newIndex + length));
      index = newIndex + length;
      continue;
    }
    index = skipField(data, index, wireType);
  }

  return { payload, nodeId };
}

/** Whether a parsed response is usable (hex signature + node id present). */
export function validateChallengeResponse(
  response: DeviceChallengeResponse,
): boolean {
  if (!response.success || !response.nodeId || !response.signedChallenge) {
    return false;
  }
  return /^[0-9a-fA-F]+$/.test(response.signedChallenge);
}
