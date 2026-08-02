/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFStorageAdapterInterface } from "@store";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import {
  normalizeSdkIdentifier,
  type SDKIdentifier,
} from "./sdk.identifiers";
import { RUNTIME_CONFIG_STORAGE_KEYS } from "./runtime.keys.config";

export type { SDKIdentifier } from "./sdk.identifiers";

/**
 * Origin of the deployment's own admin dashboard, when it publishes one. A private
 * deployment hosts its legal pages there, so the app links to those instead of
 * Espressif's. Absent for RainMaker Classic / RainMaker Neo, which keep the region defaults.
 */
interface DeploymentDashboard {
  dashboardUrl?: string;
}

export interface ESPRMRuntimeConfig extends DeploymentDashboard {
  baseUrl?: string;
  claimUrl?: string;
  version?: string;
  authUrl?: string;
  clientId?: string;
  redirectUrl?: string;
  authProviders?: string[];
}

export interface ESPRMNeoRuntimeConfig extends DeploymentDashboard {
  baseUrl?: string;
  userApiBase?: string;
  awsRegion?: string;
  iotEndpoint?: string;
}

export type SDKConfig = ESPRMRuntimeConfig | ESPRMNeoRuntimeConfig;

export interface ScannedConfigPayload {
  version?: number;
  sdk: SDKIdentifier;
  config: SDKConfig;
}

export { RUNTIME_CONFIG_STORAGE_KEYS } from "./runtime.keys.config";

/** A remembered private-deployment selection (scanned config). */
export interface PrivateDeployment {
  sdk: SDKIdentifier;
  config: SDKConfig;
}

class RuntimeConfigManager {
  private _sdk: SDKIdentifier | null = null;
  private _config: SDKConfig | null = null;
  private _privateDeployment: PrivateDeployment | null = null;
  private _storageAdapter: ESPCDFStorageAdapterInterface;

  constructor(storageAdapter: ESPCDFStorageAdapterInterface = asyncStorageAdapter) {
    this._storageAdapter = storageAdapter;
  }

  /**
   * Load persisted runtime config from storage adapter.
   * Must be called ONCE at app startup (in _layout.tsx), before any
   * SDK is configured or any screen is rendered.
   *
   * Unrecognized SDK ids are dropped so the env default applies.
   */
  async loadFromStorage(): Promise<void> {
    try {
      const sdk = await this._storageAdapter.getItem(RUNTIME_CONFIG_STORAGE_KEYS.SDK);
      const raw = await this._storageAdapter.getItem(RUNTIME_CONFIG_STORAGE_KEYS.CONFIG);

      if (sdk) {
        const normalized = normalizeSdkIdentifier(sdk);
        if (normalized) {
          this._sdk = normalized;
        } else {
          // Unrecognized id cannot activate any adaptor — drop it so env default applies.
          this._sdk = null;
          await this._storageAdapter.removeItem(RUNTIME_CONFIG_STORAGE_KEYS.SDK);
        }
      }
      if (raw) {
        this._config = JSON.parse(raw) as SDKConfig;
      }
    } catch {
      this._sdk = null;
      this._config = null;
    }

    // Remembered private deployment is independent of the active config: a
    // failure to read it must not discard the active one.
    try {
      const privateSdk = await this._storageAdapter.getItem(
        RUNTIME_CONFIG_STORAGE_KEYS.PRIVATE_SDK
      );
      const privateRaw = await this._storageAdapter.getItem(
        RUNTIME_CONFIG_STORAGE_KEYS.PRIVATE_CONFIG
      );
      const normalizedPrivateSdk = normalizeSdkIdentifier(privateSdk);
      if (normalizedPrivateSdk && privateRaw) {
        this._privateDeployment = {
          sdk: normalizedPrivateSdk,
          config: JSON.parse(privateRaw) as SDKConfig,
        };
      } else {
        this._privateDeployment = null;
        if (privateSdk || privateRaw) {
          await this._storageAdapter.removeItem(
            RUNTIME_CONFIG_STORAGE_KEYS.PRIVATE_SDK
          );
          await this._storageAdapter.removeItem(
            RUNTIME_CONFIG_STORAGE_KEYS.PRIVATE_CONFIG
          );
        }
      }
    } catch {
      this._privateDeployment = null;
    }
  }

  /**
   * Remember a scanned (private deployment) config so the user can return to
   * it later without re-scanning the QR code. Stored separately from the
   * active config, which RainMaker Classic / RainMaker Neo selections overwrite.
   */
  async rememberPrivateDeployment(
    sdk: SDKIdentifier,
    config: SDKConfig
  ): Promise<void> {
    await this._storageAdapter.setItem(
      RUNTIME_CONFIG_STORAGE_KEYS.PRIVATE_SDK,
      sdk
    );
    await this._storageAdapter.setItem(
      RUNTIME_CONFIG_STORAGE_KEYS.PRIVATE_CONFIG,
      JSON.stringify(config)
    );
    this._privateDeployment = { sdk, config };
  }

  /**
   * Validate, persist, and apply a newly scanned config payload.
   * Called by ConfigScan screen after JSON is fetched and validated.
   *
   * @param sdk - Target SDK id (must be a supported {@link SDKIdentifier})
   * @param config - Cloud config for that SDK
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
    await this._storageAdapter.removeItem(
      RUNTIME_CONFIG_STORAGE_KEYS.PRIVATE_SDK
    );
    await this._storageAdapter.removeItem(
      RUNTIME_CONFIG_STORAGE_KEYS.PRIVATE_CONFIG
    );
    this._sdk = null;
    this._config = null;
    this._privateDeployment = null;
  }

  get activeSdk(): SDKIdentifier | null {
    return this._sdk;
  }

  get config(): SDKConfig | null {
    return this._config;
  }

  /** Last scanned private deployment, or null if none was ever configured. */
  get privateDeployment(): PrivateDeployment | null {
    return this._privateDeployment;
  }

  get isRuntimeConfigActive(): boolean {
    return this._sdk !== null && this._config !== null;
  }
}

export const runtimeConfigManager = new RuntimeConfigManager();
