/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";
import type { ESPLocalControlAdapterInterface } from "@store";

const { ESPLocalControlModule } = NativeModules;

/**
 * Protocomm endpoints selecting the local-control protocol for a connection.
 *
 * Supplied by the RMNeo SDK's local transport: RainMaker Neo firmware serves
 * `rmaker_local_ctrl/session`, while RainMaker (classic) firmware serves
 * `esp_local_ctrl/session`. When absent, the native module keeps its legacy
 * `esp_local_ctrl` defaults.
 */
export interface ESPLocalControlSessionOptions {
  /** Protocol tag, for diagnostics on the native side. */
  protocol?: string;
  /** Protocomm session-security endpoint. */
  sessionPath?: string;
  /** Version/service-info endpoint, probed for `sec_patch_ver` on sec2. */
  versionPath?: string;
  /** Root key holding `sec_patch_ver` in the version response JSON. */
  versionKey?: string;
}

/**
 * Native `ESPLocalControlModule` surface.
 *
 * `connect` takes one more argument than the CDF adapter interface: the
 * {@link ESPLocalControlSessionOptions} map. Pass `null` for the native default.
 */
type ESPLocalControlNativeModule = Omit<
  ESPLocalControlAdapterInterface,
  "connect"
> & {
  connect(
    nodeId: string,
    baseUrl: string,
    securityType: number,
    pop?: string,
    username?: string,
    options?: ESPLocalControlSessionOptions | null
  ): Promise<Record<string, any>>;
};

export default ESPLocalControlModule as ESPLocalControlNativeModule;
