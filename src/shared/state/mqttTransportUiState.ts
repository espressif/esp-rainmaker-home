/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { makeAutoObservable } from "mobx";

/**
 * App MQTT transport connectivity for UI overlays.
 * Distinct from per-node shadow `online` / `availableTransports.mqtt`.
 */
class MqttTransportUiState {
  /** True while the app's central MQTT client is usable. */
  connected = true;

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Updates transport connectivity for UI consumers.
   * @param connected - Whether the app MQTT session is up
   */
  setConnected(connected: boolean): void {
    this.connected = connected;
  }
}

export const mqttTransportUiState = new MqttTransportUiState();
