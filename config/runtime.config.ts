/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFStorageAdapterInterface } from "@store";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import type { SDKIdentifier } from "./sdk.identifiers";
import { RUNTIME_CONFIG_STORAGE_KEYS } from "./runtime.keys.config";

export type { SDKIdentifier } from "./sdk.identifiers";

export interface ESPRMRuntimeConfig {
  baseUrl?: string;
  claimUrl?: string;
  version?: string;
  authUrl?: string;
  clientId?: string;
  redirectUrl?: string;
  authProviders?: string[];
}

export interface ESPRMNGRuntimeConfig {
  baseUrl?: string;
  apiPath?: string;
  userApiBase?: string;
  userApiBaseUrl?: string;
  userApiPath?: string;
  identityId?: string;
  awsRegion?: string;
  userPoolId?: string;
  clientId?: string;
  iotEndpoint?: string;
}

export type SDKConfig = ESPRMRuntimeConfig | ESPRMNGRuntimeConfig;

export interface ScannedConfigPayload {
  version?: number;
  sdk: SDKIdentifier;
  config: SDKConfig;
}

export { RUNTIME_CONFIG_STORAGE_KEYS } from "./runtime.keys.config";

class RuntimeConfigManager {
  private _sdk: SDKIdentifier | null = null;
  private _config: SDKConfig | null = null;
  private _storageAdapter: ESPCDFStorageAdapterInterface;

  constructor(storageAdapter: ESPCDFStorageAdapterInterface = asyncStorageAdapter) {
    this._storageAdapter = storageAdapter;
  }

  /**
   * Load persisted runtime config from storage adapter.
   * Must be called ONCE at app startup (in _layout.tsx), before any
   * SDK is configured or any screen is rendered.
   */
  async loadFromStorage(): Promise<void> {
    try {
      const sdk = await this._storageAdapter.getItem(RUNTIME_CONFIG_STORAGE_KEYS.SDK);
      const raw = await this._storageAdapter.getItem(RUNTIME_CONFIG_STORAGE_KEYS.CONFIG);

      if (sdk) {
        this._sdk = sdk as SDKIdentifier;
      }
      if (raw) {
        this._config = JSON.parse(raw) as SDKConfig;
      }
    } catch {
      this._sdk = null;
      this._config = null;
    }
  }

  /**
   * Validate, persist, and apply a newly scanned config payload.
   * Called by ConfigScan screen after JSON is fetched and validated.
   */
  async applyAndPersist(sdk: SDKIdentifier, config: SDKConfig): Promise<void> {
    await this._storageAdapter.setItem(RUNTIME_CONFIG_STORAGE_KEYS.SDK, sdk);
    await this._storageAdapter.setItem(
      RUNTIME_CONFIG_STORAGE_KEYS.CONFIG,
      JSON.stringify(config)
    );
    this._sdk = sdk;
    this._config = config;
  }

  /**
   * Remove runtime config from storage (debug / dev reset only).
   * After calling this, restart the app to revert to compile-time defaults.
   */
  async reset(): Promise<void> {
    await this._storageAdapter.removeItem(RUNTIME_CONFIG_STORAGE_KEYS.SDK);
    await this._storageAdapter.removeItem(RUNTIME_CONFIG_STORAGE_KEYS.CONFIG);
    this._sdk = null;
    this._config = null;
  }

  get activeSdk(): SDKIdentifier | null {
    return this._sdk;
  }

  get config(): SDKConfig | null {
    return this._config;
  }

  get isRuntimeConfigActive(): boolean {
    return this._sdk !== null && this._config !== null;
  }
}

export const runtimeConfigManager = new RuntimeConfigManager();
