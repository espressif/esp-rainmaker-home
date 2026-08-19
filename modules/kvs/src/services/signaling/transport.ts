/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import "react-native-get-random-values";
import { RTCSessionDescription, RTCIceCandidate } from "react-native-webrtc";

import { createKvsLogger, redactUrlForLog } from "../../logger";
import {
  SIGNALING_EVENTS,
  SIGNALING_MESSAGE_SDP_ANSWER,
  SIGNALING_MESSAGE_ICE_CANDIDATE,
  SIGNALING_MESSAGE_STATUS_RESPONSE,
  SIGNALING_ACTION_SDP_OFFER,
  SIGNALING_ACTION_ICE_CANDIDATE,
  SIGNALING_STATUS_OK,
  SDP_TYPE_ANSWER,
  SDP_TYPE_OFFER,
  SIGV4_ALGORITHM,
  SIGV4_EXPIRES_SECONDS,
  SIGV4_SIGNED_HEADERS,
  SIGV4_SERVICE_KINESISVIDEO,
  WEBSOCKET_OPEN_TIMEOUT_MS,
  ERROR_WEBSOCKET_OPEN_TIMEOUT,
  ERROR_WEBSOCKET_CLOSED_BEFORE_OPEN,
} from "./constants";
import type {
  SignalingClientConfig,
  SignalingEventType,
  SignalingEventHandler,
  SignalingEventMap,
  SignalingMessage,
  MessageHandler,
} from "./types";

const logger = createKvsLogger("KvsSignalingClient");

/** Minimal Node-style crypto surface used for SigV4 (host polyfill). */
interface NodeCryptoLike {
  createHash: (algorithm: string) => {
    update: (data: string) => { digest: (encoding: string) => string };
  };
  createHmac: (
    algorithm: string,
    key: string | Uint8Array,
  ) => {
    update: (data: string) => {
      digest: (encoding: string) => string | Uint8Array;
    };
  };
}

/**
 * Resolves the host crypto polyfill (`global.crypto` with createHash/createHmac).
 * @returns Node-style crypto helpers.
 * @throws If the polyfill is missing.
 */
function getCrypto(): NodeCryptoLike {
  const cryptoObj = (globalThis as unknown as { crypto?: NodeCryptoLike }).crypto;
  if (!cryptoObj?.createHmac || !cryptoObj?.createHash) {
    throw new Error(
      "crypto.createHmac is not available. Ensure the crypto polyfill is initialized before using AWS SigV4.",
    );
  }
  return cryptoObj;
}

/**
 * KVS WebRTC signaling client (viewer) over a SigV4-signed WebSocket.
 * Host apps must initialize RN crypto / get-random-values polyfills first.
 */
export class KvsSignalingClient {
  private ws: WebSocket | null = null;
  private config: SignalingClientConfig;
  private eventHandlers: {
    [K in SignalingEventType]?: SignalingEventHandler<K>[];
  } = {};
  private signedUrl: string | null = null;
  private isConnected: boolean = false;
  private openPromise: Promise<void> | null = null;

  /**
   * Creates a KVS signaling client for WebRTC viewer signaling over WebSocket.
   * @param config - Endpoint, channel ARN, region, credentials, and client ID.
   */
  constructor(config: SignalingClientConfig) {
    this.validateSigningConfig(config);
    this.config = config;
  }

  /**
   * Registers an event listener.
   * @param event - Signaling event name.
   * @param handler - Callback invoked when the event fires.
   */
  on<K extends SignalingEventType>(
    event: K,
    handler: SignalingEventHandler<K>,
  ): void {
    const list = (this.eventHandlers[event] ??
      []) as SignalingEventHandler<K>[];
    list.push(handler);
    this.eventHandlers[event] = list as (typeof this.eventHandlers)[K];
  }

  /**
   * Removes a previously registered event listener.
   * @param event - Signaling event name.
   * @param handler - Callback to remove.
   */
  off<K extends SignalingEventType>(
    event: K,
    handler: SignalingEventHandler<K>,
  ): void {
    const handlers = this.eventHandlers[event] as
      | SignalingEventHandler<K>[]
      | undefined;
    if (!handlers) return;
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emits an event to all registered listeners. Handler errors are logged and
   * do not stop remaining listeners.
   * @param event - Signaling event name.
   * @param payload - Typed payload for the event (omitted for void events).
   */
  private emit<K extends SignalingEventType>(
    event: K,
    ...payload: SignalingEventMap[K] extends undefined
      ? []
      : [SignalingEventMap[K]]
  ): void {
    const handlers = this.eventHandlers[event];
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        (handler as (...args: unknown[]) => void)(...payload);
      } catch (err) {
        logger.error(`Error in "${event}" handler:`, err);
      }
    }
  }

  /**
   * Validates required configuration for WebSocket URL signing.
   * @param config - Config to validate (defaults to the instance config).
   * @throws If any required parameter is missing or invalid.
   */
  private validateSigningConfig(config?: SignalingClientConfig): void {
    const { channelEndpoint, region, credentials } = config || this.config;

    if (
      !channelEndpoint ||
      typeof channelEndpoint !== "string" ||
      channelEndpoint.trim() === ""
    ) {
      throw new Error(
        "channelEndpoint is required and must be a non-empty string",
      );
    }

    try {
      new URL(channelEndpoint);
    } catch (err) {
      throw new Error(
        `Invalid channelEndpoint URL: ${channelEndpoint}. ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!region || typeof region !== "string" || region.trim() === "") {
      throw new Error("region is required and must be a non-empty string");
    }

    if (!credentials || typeof credentials !== "object") {
      throw new Error("credentials is required and must be an object");
    }

    if (
      !credentials.accessKeyId ||
      typeof credentials.accessKeyId !== "string" ||
      credentials.accessKeyId.trim() === ""
    ) {
      throw new Error(
        "credentials.accessKeyId is required and must be a non-empty string",
      );
    }

    if (
      !credentials.secretAccessKey ||
      typeof credentials.secretAccessKey !== "string" ||
      credentials.secretAccessKey.trim() === ""
    ) {
      throw new Error(
        "credentials.secretAccessKey is required and must be a non-empty string",
      );
    }

    if (
      !credentials.sessionToken ||
      typeof credentials.sessionToken !== "string" ||
      credentials.sessionToken.trim() === ""
    ) {
      throw new Error(
        "credentials.sessionToken is required and must be a non-empty string",
      );
    }
  }

  /**
   * Signs the WebSocket URL with AWS SigV4 for KVS signaling.
   * @returns Fully signed `wss` URL with SigV4 query parameters.
   */
  private async signWebSocketURL(): Promise<string> {
    this.validateSigningConfig();

    const {
      channelEndpoint,
      channelARN,
      clientId,
      region,
      credentials: { accessKeyId, secretAccessKey, sessionToken },
    } = this.config;

    const url = new URL(channelEndpoint);
    const host = url.hostname;
    const path = url.pathname || "/";

    const amzDate = this.getAmzDate();
    const dateStamp = this.getDateStamp();

    const queryParams: Record<string, string> = {
      "X-Amz-Algorithm": SIGV4_ALGORITHM,
      "X-Amz-Credential": this.buildCredentialScope(accessKeyId, region),
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": SIGV4_EXPIRES_SECONDS,
      "X-Amz-SignedHeaders": SIGV4_SIGNED_HEADERS,
      "X-Amz-Security-Token": sessionToken!,
      ...(channelARN && { "X-Amz-ChannelARN": channelARN }),
      ...(clientId && { "X-Amz-ClientId": clientId }),
    };

    const canonicalQueryString = Object.keys(queryParams)
      .sort()
      .map(
        (k) =>
          `${this.encodeURIComponent(k)}=${this.encodeURIComponent(queryParams[k])}`,
      )
      .join("&");

    const canonicalRequest = [
      "GET",
      path,
      canonicalQueryString,
      `host:${host}\n`,
      "host",
      this.sha256(""),
    ].join("\n");

    const credentialScope = `${dateStamp}/${region}/${SIGV4_SERVICE_KINESISVIDEO}/aws4_request`;
    const stringToSign = [
      SIGV4_ALGORITHM,
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join("\n");

    const signature = this.calculateSignature(
      secretAccessKey,
      dateStamp,
      region,
      stringToSign,
    );

    return `${url.protocol}//${host}${path}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  }

  /**
   * Builds the SigV4 credential-scope query value.
   * @param accessKeyId - AWS access key id.
   * @param region - AWS region.
   * @returns Credential scope string.
   */
  private buildCredentialScope(accessKeyId: string, region: string): string {
    const dateStamp = this.getDateStamp();
    return `${accessKeyId}/${dateStamp}/${region}/${SIGV4_SERVICE_KINESISVIDEO}/aws4_request`;
  }

  /**
   * Formats the current UTC time as `YYYYMMDDTHHMMSSZ`.
   * @returns Amz date string.
   */
  private getAmzDate(): string {
    const now = new Date();
    return now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }

  /**
   * Formats the current UTC date as `YYYYMMDD`.
   * @returns Date stamp string.
   */
  private getDateStamp(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  /**
   * Encodes a URI component with SigV4-required escaping for `!'()*`.
   * @param str - Value to encode.
   * @returns Encoded string.
   */
  private encodeURIComponent(str: string): string {
    return encodeURIComponent(str).replace(/[!'()*]/g, (c) => {
      return "%" + c.charCodeAt(0).toString(16).toUpperCase();
    });
  }

  /**
   * SHA-256 hex digest via the host crypto polyfill.
   * @param message - Input string.
   * @returns Hex digest.
   */
  private sha256(message: string): string {
    return getCrypto().createHash("sha256").update(message).digest("hex");
  }

  /**
   * Derives the SigV4 signing key and signs the string-to-sign.
   * @param secretAccessKey - AWS secret access key.
   * @param dateStamp - YYYYMMDD date stamp.
   * @param region - AWS region.
   * @param stringToSign - Canonical string to sign.
   * @returns Hex signature.
   */
  private calculateSignature(
    secretAccessKey: string,
    dateStamp: string,
    region: string,
    stringToSign: string,
  ): string {
    const cryptoObj = getCrypto();

    /**
     * Creates HMAC-SHA256 binary output for SigV4 key derivation steps.
     * @param key - HMAC key material.
     * @param data - Data to sign.
     * @returns Binary digest from HMAC-SHA256.
     */
    const hmacBinary = (key: string | Uint8Array, data: string): Uint8Array => {
      return cryptoObj
        .createHmac("sha256", key)
        .update(data)
        .digest("binary") as Uint8Array;
    };

    const kDate = hmacBinary(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmacBinary(kDate, region);
    const kService = hmacBinary(kRegion, SIGV4_SERVICE_KINESISVIDEO);
    const kSigning = hmacBinary(kService, "aws4_request");

    return cryptoObj
      .createHmac("sha256", kSigning)
      .update(stringToSign)
      .digest("hex") as string;
  }

  /**
   * Clears a half-open socket after a failed `open()` attempt.
   */
  private cleanupFailedOpen(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // ignore close errors during cleanup
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.signedUrl = null;
    this.openPromise = null;
  }

  /**
   * Opens the signed WebSocket and waits until connected (or timeout / error).
   * Idempotent if already connected; concurrent callers share one in-flight open.
   * @returns Resolves when the socket is open.
   */
  async open(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    if (this.openPromise) {
      return this.openPromise;
    }

    this.openPromise = (async () => {
      try {
        this.signedUrl = await this.signWebSocketURL();
        const endpointForLog = redactUrlForLog(this.signedUrl);

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            const err = new Error(ERROR_WEBSOCKET_OPEN_TIMEOUT);
            this.cleanupFailedOpen();
            this.emit(SIGNALING_EVENTS.ERROR, err);
            reject(err);
          }, WEBSOCKET_OPEN_TIMEOUT_MS);

          /**
           * Completes the open Promise once, clearing the timeout.
           * @param action - Resolve or reject the waiter.
           */
          const finish = (action: () => void): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            action();
          };

          this.ws = new WebSocket(this.signedUrl!);

          this.ws.onopen = () => {
            this.isConnected = true;
            this.emit(SIGNALING_EVENTS.OPEN);
            logger.info("WebSocket connected to:", endpointForLog);
            finish(() => resolve());
          };

          this.ws.onmessage = (event) => {
            this.handleMessage(event.data);
          };

          this.ws.onerror = (event) => {
            const err = new Error("WebSocket error occurred");
            logger.error("WebSocket error occurred:", event.toString());
            this.emit(SIGNALING_EVENTS.ERROR, err);
            if (!this.isConnected) {
              finish(() => {
                this.cleanupFailedOpen();
                reject(err);
              });
            }
          };

          this.ws.onclose = () => {
            const wasConnected = this.isConnected;
            this.isConnected = false;
            this.ws = null;
            this.openPromise = null;
            this.emit(SIGNALING_EVENTS.CLOSE);
            logger.info("WebSocket closed");
            if (!wasConnected) {
              const err = new Error(ERROR_WEBSOCKET_CLOSED_BEFORE_OPEN);
              finish(() => {
                this.cleanupFailedOpen();
                reject(err);
              });
            }
          };
        });
      } catch (err) {
        this.cleanupFailedOpen();
        this.emit(
          SIGNALING_EVENTS.ERROR,
          err instanceof Error ? err : new Error(String(err)),
        );
        logger.error("WebSocket open failed:", err);
        throw err;
      } finally {
        if (!this.isConnected) {
          this.openPromise = null;
        }
      }
    })();

    return this.openPromise;
  }

  /**
   * Decodes WebSocket data to a trimmed string.
   * @param data - WebSocket message data (string or ArrayBuffer).
   * @returns Decoded string or null if empty/invalid.
   */
  private decodeWebSocketData(data: string | ArrayBuffer): string | null {
    if (typeof data === "string") {
      return data.trim() || null;
    }

    try {
      return new TextDecoder().decode(data).trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Safely parses JSON into an object, returning null on failure.
   * @param value - JSON string to parse.
   * @returns Parsed object or null if invalid.
   */
  private safeJsonParse<T>(value: string): T | null {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as T)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Decodes a Base64 payload to a UTF-8 JSON object.
   * @param base64 - Base64 encoded string.
   * @returns Parsed JSON object or null if invalid.
   */
  private decodeBase64Payload<T>(base64?: string): T | null {
    if (!base64) return null;

    try {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const text = new TextDecoder("utf-8").decode(bytes);
      return this.safeJsonParse<T>(text);
    } catch {
      return null;
    }
  }

  /**
   * Handles an inbound SDP_ANSWER message.
   * @param message - Signaling message containing the SDP answer payload.
   */
  private handleSdpAnswer(message: SignalingMessage): void {
    const payload = this.decodeBase64Payload<{ sdp: string }>(
      message.messagePayload,
    );
    if (!payload?.sdp) return;

    let sdp = payload.sdp;

    // Fix escaped newlines (iOS sends \r\n as literal string)
    if (sdp.includes("\\r\\n")) {
      sdp = sdp.replace(/\\r\\n/g, "\r\n");
    }

    const answer = new RTCSessionDescription({
      type: SDP_TYPE_ANSWER,
      sdp,
    });

    this.emit(SIGNALING_EVENTS.SDP_ANSWER, answer);
  }

  /**
   * Handles an inbound ICE_CANDIDATE message.
   * @param message - Signaling message containing the ICE candidate payload.
   */
  private handleIceCandidate(message: SignalingMessage): void {
    const payload = this.decodeBase64Payload<{
      candidate: string;
      sdpMLineIndex?: number;
      sdpMid?: string;
    }>(message.messagePayload);

    if (!payload?.candidate) return;

    const candidate = new RTCIceCandidate({
      candidate: payload.candidate,
      sdpMLineIndex: payload.sdpMLineIndex ?? null,
      sdpMid: payload.sdpMid ?? null,
    });

    this.emit(SIGNALING_EVENTS.ICE_CANDIDATE, candidate);
  }

  /**
   * Handles an inbound STATUS_RESPONSE message.
   * @param message - Signaling message containing the status payload.
   */
  private handleStatusResponse(message: SignalingMessage): void {
    const payload = this.decodeBase64Payload<{
      statusCode?: string;
      statusDescription?: string;
    }>(message.messagePayload);

    if (!payload || payload.statusCode === SIGNALING_STATUS_OK) return;

    this.emit(
      SIGNALING_EVENTS.ERROR,
      new Error(
        `Status error: ${payload.statusDescription || payload.statusCode}`,
      ),
    );
  }

  /**
   * Handles inbound WebSocket messages (SDP / ICE / status).
   * @param data - WebSocket message data (string or ArrayBuffer).
   */
  private handleMessage(data: string | ArrayBuffer): void {
    const messageText = this.decodeWebSocketData(data);
    if (!messageText) return;

    const message = this.safeJsonParse<SignalingMessage>(messageText);
    if (!message) return;

    const messageType = message.messageType ?? message.action;
    if (!messageType) return;

    logger.debug(
      "WebSocket message:",
      messageType,
      `(${messageText.length} bytes)`,
    );

    const handlers: Record<string, MessageHandler> = {
      [SIGNALING_MESSAGE_SDP_ANSWER]: this.handleSdpAnswer.bind(this),
      [SIGNALING_MESSAGE_ICE_CANDIDATE]: this.handleIceCandidate.bind(this),
      [SIGNALING_MESSAGE_STATUS_RESPONSE]: this.handleStatusResponse.bind(this),
    };

    handlers[messageType]?.(message);
  }

  /**
   * Sends an SDP offer to the channel master.
   * @param offer - Local peer connection SDP offer.
   */
  sendSdpOffer(offer: RTCSessionDescription): void {
    if (!this.ws || !this.isConnected) {
      throw new Error("WebSocket not connected");
    }

    const payload = JSON.stringify({ type: SDP_TYPE_OFFER, sdp: offer.sdp });
    const encodedPayload = btoa(payload);

    const message = {
      action: SIGNALING_ACTION_SDP_OFFER,
      recipientClientId: "",
      senderClientId: this.config.clientId,
      messagePayload: encodedPayload,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Sends a local ICE candidate to the channel master.
   * @param candidate - Local ICE candidate from the peer connection.
   */
  sendIceCandidate(candidate: RTCIceCandidate): void {
    if (!this.ws || !this.isConnected) {
      throw new Error("WebSocket not connected");
    }

    const payload = JSON.stringify({
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
    });
    const encodedPayload = btoa(payload);

    const message = {
      action: SIGNALING_ACTION_ICE_CANDIDATE,
      recipientClientId: "",
      senderClientId: this.config.clientId,
      messagePayload: encodedPayload,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Closes the WebSocket connection and resets connection state.
   */
  close(): void {
    this.openPromise = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}
