/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Temporary AWS credentials + IoT endpoint used to open MQTT over WSS.
 * Mirrors the app's `ESPMQTTConfig` so the native-adaptor can pass configs through.
 */
export interface EspMqttConfig {
  /** IoT broker host (scheme / `/mqtt` optional; normalized before connect). */
  endpoint: string;
  /** MQTT client id. */
  clientId: string;
  /** STS / IAM access key id. */
  accessKey: string;
  /** STS / IAM secret access key. */
  secretKey: string;
  /** STS session token (required for temporary credentials). */
  sessionToken: string;
  /**
   * AWS region id (e.g. `us-east-1`) when the endpoint hostname does not embed
   * `.iot.<region>.` (custom Neo domains).
   */
  region?: string;
}

/** Callback invoked for every broker message delivered to this client. */
export type EspMqttMessageHandler = (topic: string, payload: Buffer) => void;

/** Transport connect/disconnect status. */
export type EspMqttStatus = { connected: boolean };

/**
 * Callback invoked when the transport transitions between connected and
 * disconnected. Intentional teardown (adapter `disconnect()`, teardown of the
 * old client inside a reconnect) does not fire `connected: false`.
 */
export type EspMqttStatusHandler = (status: EspMqttStatus) => void;
