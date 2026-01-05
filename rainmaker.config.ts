/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import asyncStorageAdapter from "@/adaptors/implementations/ESPAsyncStorage";
import { provisionAdapter } from "@/adaptors/implementations/ESPProvAdapter";
import { EspLocalDiscoveryAdapter } from "@/adaptors/implementations/ESPDiscoveryAdapter";
import ESPLocalControlAdapter from "@/adaptors/implementations/ESPLocalControlAdapter";
import { ESPNotificationAdapter } from "@/adaptors/implementations/ESPNotificationAdapter";
import { espOauthAdapter } from "@/adaptors/implementations/ESPOauthAdapter";
import ESPAppUtilityAdapter from "./adaptors/implementations/ESPAppUtilityAdapter";
import { matterAdapter } from "@/adaptors/implementations/ESPMatterAdapter";

export const SDKConfig = {
  baseUrl: "https://api.rainmaker.espressif.com",
  version: "v1",
  authUrl: "https://3pauth.rainmaker.espressif.com",
  clientId: "1h7ujqjs8140n17v0ahb4n51m2",
  redirectUrl: "rainmaker://com.espressif.novahome/success",
  customStorageAdapter: asyncStorageAdapter,
  localDiscoveryAdapter: EspLocalDiscoveryAdapter,
  localControlAdapter: ESPLocalControlAdapter,
  provisionAdapter: provisionAdapter,
  notificationAdapter: ESPNotificationAdapter,
  oauthAdapter: espOauthAdapter,
  appUtilityAdapter: ESPAppUtilityAdapter,
};

export const CDFConfig = { autoSync: true };

export const matterSDKConfig = {
  ...SDKConfig,
  matterAdapter: matterAdapter,
  matterVendorId: "0x131B", // Espressif Matter Vendor ID
};