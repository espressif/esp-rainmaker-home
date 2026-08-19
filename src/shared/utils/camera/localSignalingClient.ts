/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import "react-native-get-random-values";
import { RTCSessionDescription, RTCIceCandidate } from "react-native-webrtc";

import ESPLocalControlAdapter from "@native-adaptors/implementations/ESPLocalControlAdapter";
import {
  ESPRM_WEBRTC_SIGNAL_ENDPOINT,
  WEBRTC_LOCAL_POLL_INTERVAL_FAST_MS,
  WEBRTC_LOCAL_POLL_INTERVAL_SLOW_MS,
  WEBRTC_LOCAL_POLL_TIMEOUT_MS,
  WEBRTC_LOCAL_MAX_POLL_FAILURES,
  WEBRTC_LOCAL_PEER_ID_PREFIX,
} from "@shared/utils/constants";
import type { SignalingEventType, SignalingEventHandler } from "./types";
import {
  WebrtcSignalMsgType,
  WebrtcSignalStatus,
  encodeCmdOffer,
  encodeCmdPoll,
  encodeCmdIceCandidate,
  encodeFragmentRequest,
  fragmentPayload,
  decodeSignalPayload,
  toBase64,
  fromBase64,
  type ParsedSignalPayload,
  type ParsedSignalingMessage,
} from "./webrtcSignalProto";

const LOG_PREFIX = "[LocalSignalingClient]";

/** Configuration for the local-control signaling client. */
export interface LocalSignalingClientConfig {
  /** RainMaker node id (also the local-control device handle). */
  nodeId: string;
  /** Device base URL, e.g. `http://192.168.1.42:8080`. */
  baseUrl: string;
  /** esp_local_ctrl security type (0 none, 1 Security1, 2 Security2). */
  securityType: number;
  /** Proof of possession; pass "" (never null/undefined) when not required. */
  pop?: string;
}

/**
 * WebRTC signaling client that exchanges SDP/ICE with a camera device over its
 * local-control `webrtc_signal` endpoint (protobuf over the secure
 * esp_local_ctrl session), instead of the cloud KVS WebSocket.
 *
 * Exposes the same surface as `@modules/kvs` `KvsSignalingClient`
 * (`on`/`off`/`open`/`sendSdpOffer`/`sendIceCandidate`/`close`) and emits the
 * same events (`open`/`close`/`error`/`sdpAnswer`/`iceCandidate`) so it is a
 * drop-in transport for the camera WebRTC hook.
 */
export class LocalSignalingClient {
  private config: LocalSignalingClientConfig;
  private eventHandlers: Map<SignalingEventType, SignalingEventHandler[]> = new Map();
  private peerId: string;
  private opened = false;
  private closed = false;
  private answerReceived = false;
  private pollFailures = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollStartedAt = 0;
  /** Serializes device round-trips — the native session must not interleave. */
  private sendChain: Promise<unknown> = Promise.resolve();

  /** @param config - Node id + local session parameters. */
  constructor(config: LocalSignalingClientConfig) {
    this.config = config;
    this.peerId = `${WEBRTC_LOCAL_PEER_ID_PREFIX}${Date.now().toString(36)}-${Math.floor(
      Math.random() * 1e6,
    ).toString(36)}`;
  }

  /**
   * Registers an event listener.
   * @param event - Event name.
   * @param handler - Listener callback.
   */
  on(event: SignalingEventType, handler: SignalingEventHandler): void {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, []);
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Removes an event listener.
   * @param event - Event name.
   * @param handler - Listener previously registered.
   */
  off(event: SignalingEventType, handler: SignalingEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    const i = handlers.indexOf(handler);
    if (i > -1) handlers.splice(i, 1);
  }

  /**
   * Emits an event to all listeners.
   * @param event - Event name.
   * @param args - Arguments forwarded to listeners.
   */
  private emit(event: SignalingEventType, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    handlers.forEach((h) => {
      try {
        h(...args);
      } catch {
        // Listener errors are isolated.
      }
    });
  }

  /**
   * Ensures the secure local-control session is established, then signals ready.
   * Mirrors the connect pattern used by on-network provisioning (empty-string
   * POP, never null).
   * @returns Resolves once the session is up; emits `open` on success.
   * @throws If the local session cannot be established.
   */
  async open(): Promise<void> {
    if (this.opened || this.closed) return;
    const { nodeId, baseUrl, securityType, pop } = this.config;
    try {
      const connected = await ESPLocalControlAdapter.isConnected(nodeId);
      if (!connected) {
        await ESPLocalControlAdapter.connect(
          nodeId,
          baseUrl,
          securityType,
          pop ?? "",
          undefined,
        );
      }
      this.opened = true;
      this.emit("open");
      if (__DEV__) console.log(`${LOG_PREFIX} session ready for ${nodeId}`);
    } catch (err) {
      this.emit("error", err);
      throw err;
    }
  }

  /**
   * Sends a single serialized payload to the device and returns the decoded
   * response, handling outbound + inbound fragmentation. Calls are serialized
   * so the native session is never used concurrently.
   * @param payload - Serialized `WebrtcSignalPayload` bytes.
   * @param msgType - Message type echoed on outbound fragment envelopes.
   * @returns Decoded device response payload.
   */
  private exchange(payload: Uint8Array, msgType: number): Promise<ParsedSignalPayload> {
    const run = async (): Promise<ParsedSignalPayload> => {
      // Outbound: split large payloads; the last chunk's response is the reply.
      const chunks = fragmentPayload(payload, msgType);
      let resp: ParsedSignalPayload | null = null;
      for (const chunk of chunks) {
        resp = await this.sendOnce(chunk);
      }
      if (!resp) throw new Error("empty response");

      // Inbound: if the device fragmented its reply, drain the rest by
      // requesting each next chunk with a fragment-continuation request
      // (fragment{offset,total_len}), exactly as the CLI/firmware expect — a
      // plain poll does NOT continue a fragmented response.
      if (resp.fragment && resp.fragment.totalLen > 0 && resp.fragment.data.length > 0) {
        const total = resp.fragment.totalLen;
        const buf = new Uint8Array(total);
        buf.set(resp.fragment.data, resp.fragment.offset);
        let received = resp.fragment.offset + resp.fragment.data.length;
        while (received < total && !this.closed) {
          const more = await this.sendOnce(encodeFragmentRequest(received, total));
          if (!more.fragment || more.fragment.data.length === 0) {
            throw new Error(`expected fragment at offset ${received}`);
          }
          buf.set(more.fragment.data, more.fragment.offset);
          received = more.fragment.offset + more.fragment.data.length;
        }
        return decodeSignalPayload(buf);
      }
      return resp;
    };
    const next = this.sendChain.then(run, run);
    // Keep the chain alive regardless of individual failures.
    this.sendChain = next.catch(() => undefined);
    return next;
  }

  /**
   * Sends one payload chunk over the local-control endpoint.
   * @param chunk - Serialized payload bytes.
   * @returns Decoded response payload.
   */
  private async sendOnce(chunk: Uint8Array): Promise<ParsedSignalPayload> {
    const responseB64 = await ESPLocalControlAdapter.sendData(
      this.config.nodeId,
      ESPRM_WEBRTC_SIGNAL_ENDPOINT,
      toBase64(chunk),
    );
    return decodeSignalPayload(fromBase64(responseB64));
  }

  /**
   * Sends the SDP offer, processes any piggybacked answer/ICE, then begins
   * polling for the remaining signaling messages.
   * @param offer - Local SDP offer.
   */
  sendSdpOffer(offer: RTCSessionDescription): void {
    const payload = encodeCmdOffer(this.peerId, offer.sdp, "offer");
    this.exchange(payload, WebrtcSignalMsgType.TypeCmdOffer)
      .then((resp) => {
        // Only a hard reject aborts; Pending means "accepted, answer coming via poll".
        if (
          resp.status === WebrtcSignalStatus.Fail ||
          resp.status === WebrtcSignalStatus.InvalidParam
        ) {
          throw new Error(`offer rejected (status ${resp.status})`);
        }
        this.processMessages(resp.messages);
        this.startPolling();
      })
      .catch((err) => this.emit("error", err));
  }

  /**
   * Sends a local ICE candidate and processes any piggybacked messages.
   * @param candidate - Local ICE candidate.
   */
  sendIceCandidate(candidate: RTCIceCandidate): void {
    const json = JSON.stringify({
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
    });
    const payload = encodeCmdIceCandidate(this.peerId, json);
    this.exchange(payload, WebrtcSignalMsgType.TypeCmdIceCandidate)
      .then((resp) => this.processMessages(resp.messages))
      .catch((err) => {
        if (__DEV__) console.warn(`${LOG_PREFIX} ice send failed`, err);
      });
  }

  /**
   * Applies piggybacked signaling messages: SDP answers emit `sdpAnswer`,
   * ICE candidates emit `iceCandidate`.
   * @param messages - Parsed signaling messages from a device response.
   */
  private processMessages(messages: ParsedSignalingMessage[]): void {
    for (const m of messages) {
      if (m.type === WebrtcSignalMsgType.TypeAnswer && m.sessionDesc?.sdp) {
        this.answerReceived = true;
        this.emit(
          "sdpAnswer",
          new RTCSessionDescription({ type: "answer", sdp: m.sessionDesc.sdp }),
        );
      } else if (m.type === WebrtcSignalMsgType.TypeIceCandidateMsg && m.iceCandidateJson) {
        try {
          const c = JSON.parse(m.iceCandidateJson) as {
            candidate: string;
            sdpMid?: string | null;
            sdpMLineIndex?: number | null;
          };
          if (c.candidate) {
            this.emit(
              "iceCandidate",
              new RTCIceCandidate({
                candidate: c.candidate,
                sdpMid: c.sdpMid ?? null,
                sdpMLineIndex: c.sdpMLineIndex ?? null,
              }),
            );
          }
        } catch {
          // Ignore malformed ICE JSON.
        }
      }
    }
  }

  /**
   * Polls the device for queued signaling messages until connected, timed out,
   * or too many consecutive failures. Polls fast until the answer arrives, then
   * slows down.
   */
  private startPolling(): void {
    if (this.pollTimer || this.closed) return;
    this.pollStartedAt = Date.now();

    const tick = async (): Promise<void> => {
      if (this.closed) return;
      if (Date.now() - this.pollStartedAt > WEBRTC_LOCAL_POLL_TIMEOUT_MS) {
        if (__DEV__) console.log(`${LOG_PREFIX} poll timeout`);
        return;
      }
      try {
        const resp = await this.exchange(
          encodeCmdPoll(this.peerId),
          WebrtcSignalMsgType.TypeCmdPoll,
        );
        this.pollFailures = 0;
        this.processMessages(resp.messages);
      } catch (err) {
        this.pollFailures += 1;
        if (this.pollFailures >= WEBRTC_LOCAL_MAX_POLL_FAILURES) {
          this.emit("error", err instanceof Error ? err : new Error("poll failed"));
          return;
        }
      }
      if (this.closed) return;
      const interval = this.answerReceived
        ? WEBRTC_LOCAL_POLL_INTERVAL_SLOW_MS
        : WEBRTC_LOCAL_POLL_INTERVAL_FAST_MS;
      this.pollTimer = setTimeout(tick, interval);
    };

    this.pollTimer = setTimeout(tick, WEBRTC_LOCAL_POLL_INTERVAL_FAST_MS);
  }

  /** Stops polling and releases the client; emits `close`. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.emit("close");
  }
}
