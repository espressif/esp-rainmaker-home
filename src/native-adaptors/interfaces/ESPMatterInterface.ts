/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";
import { ESPMatterNativeDataPayload } from "../contracts/matter";

/**
 * Interface for ESP Matter Native Module
 *
 * This interface defines the methods available in the native Android/iOS
 * Matter commissioning module for React Native integration.
 */
export interface ESPMatterNativeInterface {
  startEcosystemCommissioning(
    onboardingPayload: string,
    fabric: any
  ): Promise<any>;

  generateCSR(params: {
    groupId: string;
    fabricId: string;
    name: string;
  }): Promise<any>;

  postMessage(payload: ESPMatterNativeDataPayload): Promise<any>;

  /** iOS only: ends the commissioning session in flight, if any. */
  cancelCommissioning?(): Promise<{ cancelled: boolean }>;
}

const matterModule =
  (NativeModules as any).ESPMatterModule ??
  (NativeModules as any).ESPMatterCommissionModule;

if (!matterModule) {
  console.error("ESPMatterNativeInterface is not available in NativeModules!");
}

export default matterModule as ESPMatterNativeInterface;