/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Browser entry for `@modules/mqtt/web` — AWS IoT MQTT over WSS
 * via `aws-iot-device-sdk-v2`.
 */

export { webMqttManager } from "./mqttManager";
export { logWebMqtt } from "./logger";
export { MQTT_KEEPALIVE_SECONDS } from "./constants";
export { normalizeIotEndpointHost } from "./utils/normalizeEndpoint";
export {
  parseRegionIdFromIotHost,
  resolveAwsRegion,
} from "./utils/parseRegion";
export type { EspMqttConfig, EspMqttMessageHandler } from "../src/types";
