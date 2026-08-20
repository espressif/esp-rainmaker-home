/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hand-rolled protobuf codec for the `rmaker_webrtc_signal` schema used by the
 * device's local-control WebRTC signaling endpoint (`webrtc_signal`).
 *
 * The schema is small and stable (mirrors esp-rainmaker-cli
 * `rmaker_webrtc_signal.proto` and the native `LocalSignalingClient`), so we
 * encode/decode the handful of messages directly with the protobuf wire format
 * (varint + length-delimited) rather than pulling in a protoc/protobufjs
 * toolchain. Field numbers below are kept in lock-step with the `.proto`.
 */

import { Buffer } from "buffer";

/** Protocol version carried in every `WebrtcSignalPayload`. */
export const WEBRTC_SIGNAL_PROTOCOL_VERSION = 1;

/**
 * Max serialized payload (bytes) the device transport accepts per message.
 * Larger payloads (e.g. SDP offers) are split into `FragmentInfo` chunks.
 */
export const WEBRTC_SIGNAL_FRAGMENT_SIZE = 2048;

/** `WebrtcSignalMsgType` enum (proto field values). */
export const WebrtcSignalMsgType = {
  TypeCmdOffer: 0,
  TypeRespOffer: 1,
  TypeCmdPoll: 2,
  TypeRespPoll: 3,
  TypeCmdIceCandidate: 4,
  TypeRespIceCandidate: 5,
  TypeAnswer: 6,
  TypeIceCandidateMsg: 7,
} as const;

/** `WebrtcSignalStatus` enum (proto field values). */
export const WebrtcSignalStatus = {
  Success: 0,
  Fail: 1,
  InvalidParam: 2,
  Pending: 3,
} as const;

// Field numbers — kept in sync with rmaker_webrtc_signal.proto.
const F_PAYLOAD_MSG = 1;
const F_PAYLOAD_VERSION = 2;
const F_PAYLOAD_FRAGMENT = 3;
const F_PAYLOAD_CMD_OFFER = 10;
const F_PAYLOAD_RESP_OFFER = 11;
const F_PAYLOAD_CMD_POLL = 12;
const F_PAYLOAD_RESP_POLL = 13;
const F_PAYLOAD_CMD_ICE = 14;
const F_PAYLOAD_RESP_ICE = 15;

const F_SDP_SDP = 1;
const F_SDP_TYPE = 2;

const F_SIGMSG_TYPE = 1;
const F_SIGMSG_SESSION_DESC = 2;
const F_SIGMSG_ICE_JSON = 3;

const F_FRAG_OFFSET = 1;
const F_FRAG_TOTAL_LEN = 2;
const F_FRAG_DATA = 3;

const F_CMDOFFER_PEER_ID = 1;
const F_CMDOFFER_OFFER = 2;

const F_CMDPOLL_PEER_ID = 1;

const F_CMDICE_PEER_ID = 1;
const F_CMDICE_PAYLOAD = 2;

const F_RESP_STATUS = 1;
const F_RESPOFFER_PEER_ID = 2;
const F_RESPOFFER_MESSAGES = 3;
const F_RESP_MESSAGES = 2; // RespPoll / RespIceCandidate

const WIRE_VARINT = 0;
const WIRE_LEN = 2;

/** A signaling message piggybacked in a device response. */
export interface ParsedSignalingMessage {
  type: number;
  sessionDesc?: { sdp: string; type: string };
  iceCandidateJson?: string;
}

/** Decoded `WebrtcSignalPayload` — only the populated branch is set. */
export interface ParsedSignalPayload {
  msg: number;
  version: number;
  fragment?: { offset: number; totalLen: number; data: Uint8Array };
  status?: number;
  peerId?: string;
  messages: ParsedSignalingMessage[];
}

/** Minimal protobuf writer (varint + length-delimited fields). */
class ProtoWriter {
  private bytes: number[] = [];

  /**
   * Appends a base-128 varint.
   * @param value - Non-negative integer to encode.
   */
  private varint(value: number): void {
    let v = value >>> 0;
    while (v > 0x7f) {
      this.bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.bytes.push(v);
  }

  /**
   * Writes a field key (field number + wire type).
   * @param field - Proto field number.
   * @param wire - Wire type (0 varint, 2 length-delimited).
   */
  private key(field: number, wire: number): void {
    this.varint((field << 3) | wire);
  }

  /**
   * Writes a varint field; skips zero values (proto3 default).
   * @param field - Proto field number.
   * @param value - Integer value.
   */
  varintField(field: number, value: number): void {
    if (!value) return;
    this.key(field, WIRE_VARINT);
    this.varint(value);
  }

  /**
   * Writes a length-delimited raw-bytes field; skips empty values.
   * @param field - Proto field number.
   * @param data - Raw bytes.
   */
  bytesField(field: number, data: Uint8Array): void {
    if (!data.length) return;
    this.key(field, WIRE_LEN);
    this.varint(data.length);
    for (let i = 0; i < data.length; i++) this.bytes.push(data[i]);
  }

  /**
   * Writes a UTF-8 string field; skips empty strings (proto3 default).
   * @param field - Proto field number.
   * @param value - String value.
   */
  stringField(field: number, value: string): void {
    if (!value) return;
    this.bytesField(field, new Uint8Array(Buffer.from(value, "utf-8")));
  }

  /**
   * Writes an embedded message field from its serialized bytes.
   * @param field - Proto field number.
   * @param data - Serialized sub-message.
   */
  messageField(field: number, data: Uint8Array): void {
    this.bytesField(field, data);
  }

  /**
   * Finalizes the buffer.
   * @returns The serialized bytes.
   */
  finish(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/** Minimal protobuf reader. */
class ProtoReader {
  private pos = 0;

  /** @param buf - Bytes to parse. */
  constructor(private buf: Uint8Array) {}

  /** @returns True while bytes remain. */
  hasMore(): boolean {
    return this.pos < this.buf.length;
  }

  /**
   * @returns The next base-128 varint. Uses multiplication (not `<< shift`) so
   * values beyond 2^31 decode correctly — JS `<<` is 32-bit and would corrupt
   * the high bits / wrap at shift >= 32.
   */
  varint(): number {
    let result = 0;
    let shift = 0;
    while (this.pos < this.buf.length) {
      const b = this.buf[this.pos++];
      result += (b & 0x7f) * Math.pow(2, shift);
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  /** @returns The next field as `{ field, wire }`. */
  key(): { field: number; wire: number } {
    const k = this.varint();
    return { field: k >>> 3, wire: k & 0x7 };
  }

  /** @returns The next length-delimited chunk as a freshly-copied byte array. */
  lenBytes(): Uint8Array {
    const len = this.varint();
    const out = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  /** @returns The next length-delimited chunk decoded as UTF-8. */
  lenString(): string {
    return Buffer.from(this.lenBytes()).toString("utf-8");
  }

  /**
   * Skips an unknown field by wire type so forward-compatible fields don't
   * break parsing.
   * @param wire - Wire type to skip.
   */
  skip(wire: number): void {
    if (wire === WIRE_VARINT) this.varint();
    else if (wire === WIRE_LEN) this.lenBytes();
  }
}

/**
 * Serializes a `SessionDescription` sub-message.
 * @param sdp - SDP string.
 * @param type - "offer" or "answer".
 * @returns Serialized bytes.
 */
function encodeSessionDescription(sdp: string, type: string): Uint8Array {
  const w = new ProtoWriter();
  w.stringField(F_SDP_SDP, sdp);
  w.stringField(F_SDP_TYPE, type);
  return w.finish();
}

/**
 * Builds a `WebrtcSignalPayload(TypeCmdOffer)` for sending an SDP offer.
 * @param peerId - Client peer id.
 * @param sdp - SDP offer string.
 * @param type - SDP type (default "offer").
 * @returns Serialized payload bytes.
 */
export function encodeCmdOffer(
  peerId: string,
  sdp: string,
  type: string = "offer",
): Uint8Array {
  const cmd = new ProtoWriter();
  cmd.stringField(F_CMDOFFER_PEER_ID, peerId);
  cmd.messageField(F_CMDOFFER_OFFER, encodeSessionDescription(sdp, type));

  const w = new ProtoWriter();
  w.varintField(F_PAYLOAD_MSG, WebrtcSignalMsgType.TypeCmdOffer);
  w.varintField(F_PAYLOAD_VERSION, WEBRTC_SIGNAL_PROTOCOL_VERSION);
  w.messageField(F_PAYLOAD_CMD_OFFER, cmd.finish());
  return w.finish();
}

/**
 * Builds a `WebrtcSignalPayload(TypeCmdPoll)` to poll for queued messages.
 * @param peerId - Client peer id.
 * @returns Serialized payload bytes.
 */
export function encodeCmdPoll(peerId: string): Uint8Array {
  const cmd = new ProtoWriter();
  cmd.stringField(F_CMDPOLL_PEER_ID, peerId);

  const w = new ProtoWriter();
  w.varintField(F_PAYLOAD_MSG, WebrtcSignalMsgType.TypeCmdPoll);
  w.varintField(F_PAYLOAD_VERSION, WEBRTC_SIGNAL_PROTOCOL_VERSION);
  w.messageField(F_PAYLOAD_CMD_POLL, cmd.finish());
  return w.finish();
}

/**
 * Builds a `WebrtcSignalPayload(TypeCmdIceCandidate)` for a local ICE candidate.
 * @param peerId - Client peer id.
 * @param iceCandidateJson - Standard WebRTC ICE candidate JSON string.
 * @returns Serialized payload bytes.
 */
export function encodeCmdIceCandidate(
  peerId: string,
  iceCandidateJson: string,
): Uint8Array {
  const cmd = new ProtoWriter();
  cmd.stringField(F_CMDICE_PEER_ID, peerId);
  cmd.stringField(F_CMDICE_PAYLOAD, iceCandidateJson);

  const w = new ProtoWriter();
  w.varintField(F_PAYLOAD_MSG, WebrtcSignalMsgType.TypeCmdIceCandidate);
  w.varintField(F_PAYLOAD_VERSION, WEBRTC_SIGNAL_PROTOCOL_VERSION);
  w.messageField(F_PAYLOAD_CMD_ICE, cmd.finish());
  return w.finish();
}

/**
 * Wraps a serialized payload chunk in a fragment envelope
 * (`WebrtcSignalPayload` with only `fragment` set).
 * @param offset - Byte offset of this chunk in the reassembled message.
 * @param totalLen - Total length of the reassembled message.
 * @param chunk - Raw chunk bytes.
 * @param msg - Message type echoed on the envelope.
 * @returns Serialized fragment payload bytes.
 */
export function encodeFragment(
  offset: number,
  totalLen: number,
  chunk: Uint8Array,
  msg: number,
): Uint8Array {
  const frag = new ProtoWriter();
  frag.varintField(F_FRAG_OFFSET, offset);
  frag.varintField(F_FRAG_TOTAL_LEN, totalLen);
  frag.bytesField(F_FRAG_DATA, chunk);

  const w = new ProtoWriter();
  w.varintField(F_PAYLOAD_MSG, msg);
  w.varintField(F_PAYLOAD_VERSION, WEBRTC_SIGNAL_PROTOCOL_VERSION);
  w.messageField(F_PAYLOAD_FRAGMENT, frag.finish());
  return w.finish();
}

/**
 * Builds a fragment-continuation request: a `WebrtcSignalPayload` with only
 * `fragment{offset, total_len}` set (no data). The device replies with the
 * chunk at `offset`. This is how inbound (device → app) fragmented responses
 * are drained — NOT a plain poll.
 * @param offset - Next byte offset to request.
 * @param totalLen - Total length of the reassembled message.
 * @returns Serialized fragment-request payload bytes.
 */
export function encodeFragmentRequest(offset: number, totalLen: number): Uint8Array {
  return encodeFragment(offset, totalLen, new Uint8Array(0), 0);
}

/**
 * Splits a serialized payload into fragment envelopes if it exceeds the
 * transport limit; otherwise returns it as a single chunk.
 * @param payload - Full serialized `WebrtcSignalPayload` bytes.
 * @param msg - Message type to echo on fragment envelopes.
 * @returns One-or-more serialized payloads to send in order.
 */
export function fragmentPayload(payload: Uint8Array, msg: number): Uint8Array[] {
  if (payload.length <= WEBRTC_SIGNAL_FRAGMENT_SIZE) return [payload];
  const out: Uint8Array[] = [];
  for (let off = 0; off < payload.length; off += WEBRTC_SIGNAL_FRAGMENT_SIZE) {
    const chunk = payload.subarray(off, off + WEBRTC_SIGNAL_FRAGMENT_SIZE);
    out.push(encodeFragment(off, payload.length, chunk, msg));
  }
  return out;
}

/**
 * Parses a `SignalingMessage` sub-message.
 * @param bytes - Serialized sub-message.
 * @returns Parsed signaling message.
 */
function decodeSignalingMessage(bytes: Uint8Array): ParsedSignalingMessage {
  const r = new ProtoReader(bytes);
  const out: ParsedSignalingMessage = { type: 0 };
  while (r.hasMore()) {
    const { field, wire } = r.key();
    if (field === F_SIGMSG_TYPE && wire === WIRE_VARINT) {
      out.type = r.varint();
    } else if (field === F_SIGMSG_SESSION_DESC && wire === WIRE_LEN) {
      const sub = new ProtoReader(r.lenBytes());
      const sd = { sdp: "", type: "" };
      while (sub.hasMore()) {
        const k = sub.key();
        if (k.field === F_SDP_SDP && k.wire === WIRE_LEN) sd.sdp = sub.lenString();
        else if (k.field === F_SDP_TYPE && k.wire === WIRE_LEN) sd.type = sub.lenString();
        else sub.skip(k.wire);
      }
      out.sessionDesc = sd;
    } else if (field === F_SIGMSG_ICE_JSON && wire === WIRE_LEN) {
      out.iceCandidateJson = r.lenString();
    } else {
      r.skip(wire);
    }
  }
  return out;
}

/**
 * Parses a serialized `WebrtcSignalPayload` device response.
 * Handles RespOffer / RespPoll / RespIceCandidate and fragment envelopes.
 * @param bytes - Serialized payload bytes.
 * @returns Parsed payload with status, peer id, and piggybacked messages.
 */
export function decodeSignalPayload(bytes: Uint8Array): ParsedSignalPayload {
  const r = new ProtoReader(bytes);
  const out: ParsedSignalPayload = { msg: 0, version: 0, messages: [] };

  /**
   * Reads a response sub-message (status + repeated messages [+ peer id]).
   * @param sub - Reader over the sub-message bytes.
   * @param peerIdField - Field number carrying peer id, if any.
   */
  const readResp = (sub: ProtoReader, peerIdField: number): void => {
    while (sub.hasMore()) {
      const { field, wire } = sub.key();
      if (field === F_RESP_STATUS && wire === WIRE_VARINT) {
        out.status = sub.varint();
      } else if (peerIdField && field === peerIdField && wire === WIRE_LEN) {
        out.peerId = sub.lenString();
      } else if (
        wire === WIRE_LEN &&
        (field === F_RESPOFFER_MESSAGES || field === F_RESP_MESSAGES)
      ) {
        out.messages.push(decodeSignalingMessage(sub.lenBytes()));
      } else {
        sub.skip(wire);
      }
    }
  };

  while (r.hasMore()) {
    const { field, wire } = r.key();
    if (field === F_PAYLOAD_MSG && wire === WIRE_VARINT) {
      out.msg = r.varint();
    } else if (field === F_PAYLOAD_VERSION && wire === WIRE_VARINT) {
      out.version = r.varint();
    } else if (field === F_PAYLOAD_FRAGMENT && wire === WIRE_LEN) {
      const sub = new ProtoReader(r.lenBytes());
      const frag: { offset: number; totalLen: number; data: Uint8Array } = {
        offset: 0,
        totalLen: 0,
        data: new Uint8Array(0),
      };
      while (sub.hasMore()) {
        const k = sub.key();
        if (k.field === F_FRAG_OFFSET && k.wire === WIRE_VARINT) frag.offset = sub.varint();
        else if (k.field === F_FRAG_TOTAL_LEN && k.wire === WIRE_VARINT) frag.totalLen = sub.varint();
        else if (k.field === F_FRAG_DATA && k.wire === WIRE_LEN) frag.data = sub.lenBytes();
        else sub.skip(k.wire);
      }
      out.fragment = frag;
    } else if (field === F_PAYLOAD_RESP_OFFER && wire === WIRE_LEN) {
      readResp(new ProtoReader(r.lenBytes()), F_RESPOFFER_PEER_ID);
    } else if (
      (field === F_PAYLOAD_RESP_POLL || field === F_PAYLOAD_RESP_ICE) &&
      wire === WIRE_LEN
    ) {
      readResp(new ProtoReader(r.lenBytes()), 0);
    } else {
      r.skip(wire);
    }
  }
  return out;
}

/**
 * Encodes raw payload bytes to a base64 string for `ESPLocalControlAdapter.sendData`.
 * @param bytes - Serialized payload.
 * @returns Base64 string.
 */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Decodes a base64 response from `ESPLocalControlAdapter.sendData` to bytes.
 * @param b64 - Base64 string.
 * @returns Raw bytes.
 */
export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
