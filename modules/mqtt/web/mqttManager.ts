/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { mqtt5, auth, iot } from "aws-iot-device-sdk-v2/dist/browser";

import type {
  EspMqttConfig,
  EspMqttMessageHandler,
  EspMqttStatusHandler,
} from "../src/types";
import { MQTT_KEEPALIVE_SECONDS } from "./constants";
import { logWebMqtt } from "./logger";
import { normalizeIotEndpointHost } from "./utils/normalizeEndpoint";
import { resolveAwsRegion } from "./utils/parseRegion";

/**
 * Converts an MQTT5 publish payload into a Node-style Buffer for adaptor handlers.
 * @param payload - Broker payload (string, ArrayBuffer, TypedArray, or Buffer)
 * @returns UTF-8 Buffer
 */
function payloadToBuffer(payload: unknown): Buffer {
  if (payload == null) {
    return Buffer.alloc(0);
  }
  if (typeof payload === "string") {
    return Buffer.from(payload, "utf8");
  }
  if (Buffer.isBuffer(payload)) {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload);
  }
  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
  }
  return Buffer.from(String(payload), "utf8");
}

/**
 * Mutable STS credential provider so reconnect handshakes pick up the latest
 * session returned by Neo `connectMQTT()` (StaticCredentialProvider is fixed).
 */
class SessionCredentialsProvider extends auth.CredentialsProvider {
  private credentials: auth.AWSCredentials;

  /**
   * @param credentials - Initial AWS temporary credentials
   */
  constructor(credentials: auth.AWSCredentials) {
    super();
    this.credentials = credentials;
  }

  /**
   * Replaces cached STS credentials (called before each connect).
   * @param credentials - Fresh AWS temporary credentials
   */
  update(credentials: auth.AWSCredentials): void {
    this.credentials = credentials;
  }

  /**
   * @returns Current AWS credentials for SigV4 WSS signing
   */
  getCredentials(): auth.AWSCredentials {
    return this.credentials;
  }

  /**
   * No-op — the host app refreshes STS and calls `connect()` again.
   */
  async refreshCredentials(): Promise<void> {
    return;
  }
}

/**
 * Browser MQTT transport via `aws-iot-device-sdk-v2` MQTT5 + SigV4 WSS.
 * Auto-reconnect is stopped on disconnect so the app can refresh STS
 * (same policy as the native Android bridge).
 */
class WebMqttManager {
  private client: mqtt5.Mqtt5Client | null = null;
  private connected = false;
  private messageHandler: EspMqttMessageHandler | null = null;
  private statusHandler: EspMqttStatusHandler | null = null;
  // True while an intentional teardown is in flight (adapter `disconnect()`,
  // or the pre-connect teardown of a stale client). Suppresses the
  // `disconnection` event from being surfaced as a `connected: false` signal.
  private intentionalDisconnect = false;
  private connectPromise: Promise<void> | null = null;
  private credentialsProvider: SessionCredentialsProvider | null = null;

  /**
   * Registers the single low-level message listener used by the app adaptor.
   * @param handler - Topic + payload callback, or `null` to clear
   */
  setMessageHandler(handler: EspMqttMessageHandler | null): void {
    this.messageHandler = handler;
  }

  /**
   * Registers the single low-level status listener used by the app adaptor.
   * Fires on real WSS drops (`connected: false`) and on fresh CONNACK
   * (`connected: true`); intentional teardown does not fire `connected: false`.
   * @param handler - Status callback, or `null` to clear
   */
  setStatusHandler(handler: EspMqttStatusHandler | null): void {
    this.statusHandler = handler;
  }

  /**
   * Opens an MQTT-over-WSS session to AWS IoT using temporary credentials.
   * Resolves immediately when already connected.
   * @param config - Endpoint, client id, and STS credentials
   */
  async connect(config: EspMqttConfig): Promise<void> {
    if (this.connected && this.client?.isConnected()) {
      logWebMqtt("connect:already-connected", { clientId: config.clientId });
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.openConnection(config).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  /**
   * Tears down the MQTT5 client and clears connection state.
   */
  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.connected = false;
    this.credentialsProvider = null;

    if (!client) {
      return;
    }

    this.intentionalDisconnect = true;
    try {
      await new Promise<void>((resolve) => {
        let settled = false;
        /**
         * Completes disconnect once the client emits `stopped` (or times out).
         */
        const finish = (): void => {
          if (settled) {
            return;
          }
          settled = true;
          client.removeListener("stopped", finish);
          resolve();
        };
        client.once("stopped", finish);
        try {
          client.stop();
        } catch {
          finish();
          return;
        }
        // Guard against a missing `stopped` event in edge teardown races.
        setTimeout(finish, 2000);
      });
    } finally {
      this.intentionalDisconnect = false;
    }
    logWebMqtt("disconnect");
  }

  /**
   * @returns Whether the MQTT5 client reports connected
   */
  async isConnected(): Promise<boolean> {
    return this.connected && this.client?.isConnected() === true;
  }

  /**
   * Publishes a payload to a topic (QoS 0).
   * @param topic - MQTT topic
   * @param payload - UTF-8 string or Buffer
   */
  async publish(topic: string, payload: string | Buffer): Promise<void> {
    const client = this.requireClient();
    const body =
      typeof payload === "string" ? payload : payload.toString("utf8");
    await client.publish({
      qos: mqtt5.QoS.AtMostOnce,
      topicName: topic,
      payload: body,
    });
  }

  /**
   * Subscribes to a broker topic filter (QoS 0).
   * @param topic - MQTT topic filter
   */
  async subscribe(topic: string): Promise<void> {
    const client = this.requireClient();
    await client.subscribe({
      subscriptions: [
        {
          qos: mqtt5.QoS.AtMostOnce,
          topicFilter: topic,
        },
      ],
    });
  }

  /**
   * Unsubscribes from a broker topic filter.
   * @param topic - MQTT topic filter
   */
  async unsubscribe(topic: string): Promise<void> {
    const client = this.requireClient();
    await client.unsubscribe({
      topicFilters: [topic],
    });
  }

  /**
   * Creates and starts an MQTT5 client with AWS IoT SigV4 WebSocket auth.
   * @param config - Connection config
   */
  private async openConnection(config: EspMqttConfig): Promise<void> {
    await this.disconnect();

    const host = normalizeIotEndpointHost(config.endpoint);
    if (!host) {
      throw new Error("ESPMQTT: missing or invalid endpoint");
    }

    const region = resolveAwsRegion(host, config.region);
    const awsCredentials: auth.AWSCredentials = {
      aws_access_id: config.accessKey,
      aws_secret_key: config.secretKey,
      aws_sts_token: config.sessionToken,
      aws_region: region,
    };

    this.credentialsProvider = new SessionCredentialsProvider(awsCredentials);

    logWebMqtt("connect:start", {
      host,
      region,
      clientId: config.clientId,
      transport: "aws-iot-device-sdk-v2",
    });

    const builder =
      iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        host,
        {
          credentialsProvider: this.credentialsProvider,
          region,
        },
      );

    builder.withConnectProperties({
      clientId: config.clientId,
      keepAliveIntervalSeconds: MQTT_KEEPALIVE_SECONDS,
    });
    builder.withSessionBehavior(mqtt5.ClientSessionBehavior.Clean);

    const client = new mqtt5.Mqtt5Client(builder.build());
    this.client = client;

    client.on("messageReceived", (eventData: mqtt5.MessageReceivedEvent) => {
      const topic = eventData.message.topicName;
      if (!topic) {
        return;
      }
      const buffer = payloadToBuffer(eventData.message.payload);
      logWebMqtt("message", { topic, bytes: buffer.length });
      this.messageHandler?.(topic, buffer);
    });

    client.on("disconnection", (eventData: mqtt5.DisconnectionEvent) => {
      this.connected = false;
      logWebMqtt("disconnection", {
        error: eventData.error?.toString?.() ?? String(eventData.error ?? ""),
      });
      // Halt CRT reconnect so JS can re-fetch STS (native does the same).
      if (this.client === client) {
        try {
          client.stop();
        } catch {
          // ignore
        }
      }
      if (!this.intentionalDisconnect) {
        this.notifyStatus({ connected: false });
      }
    });

    client.on("error", (error) => {
      logWebMqtt("error", { message: error.toString() });
    });
    client.on("info", (error) => {
      logWebMqtt("info", { message: error.toString() });
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      /**
       * Completes the connect promise once.
       * @param error - Failure reason, or undefined on success
       */
      const settle = (error?: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        client.removeListener("connectionSuccess", onSuccess);
        client.removeListener("connectionFailure", onFailure);
        if (error) {
          this.connected = false;
          try {
            client.stop();
          } catch {
            // ignore
          }
          reject(error);
          return;
        }
        this.connected = true;
        this.notifyStatus({ connected: true });
        resolve();
      };

      /**
       * Handles successful MQTT CONNACK.
       */
      const onSuccess = (): void => {
        logWebMqtt("connect:ok", { clientId: config.clientId });
        settle();
      };

      /**
       * Handles failed connection attempts.
       * @param eventData - CRT connection failure event
       */
      const onFailure = (eventData: mqtt5.ConnectionFailureEvent): void => {
        const message =
          eventData.error?.toString?.() ?? "MQTT connection failed";
        logWebMqtt("connect:error", { message });
        settle(new Error(message));
      };

      client.on("connectionSuccess", onSuccess);
      client.on("connectionFailure", onFailure);
      client.start();
    });
  }

  /**
   * Invokes the registered status handler defensively so a throwing consumer
   * cannot take the transport down.
   * @param status - Transport connect/disconnect status
   */
  private notifyStatus(status: { connected: boolean }): void {
    const handler = this.statusHandler;
    if (!handler) {
      return;
    }
    try {
      handler(status);
    } catch (error) {
      logWebMqtt("statusHandler:error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * @returns Connected MQTT5 client
   * @throws When not connected
   */
  private requireClient(): mqtt5.Mqtt5Client {
    if (!this.client || !this.connected || !this.client.isConnected()) {
      throw new Error("ESPMQTT: not connected");
    }
    return this.client;
  }
}

/** Singleton browser MQTT transport used by `ESPMQTTAdapter.web`. */
export const webMqttManager = new WebMqttManager();
