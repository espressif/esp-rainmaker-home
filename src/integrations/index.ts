/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDF, AdaptorRegistry, initCDF, disposeCDF, ESPSDKAdaptor } from "@store";
import { ESPRMBaseSDKAdaptor, ESPRMBaseAdaptorIdentifier } from '@sdk-adaptors/ESPRMBase';
import { ESPRMNeoBaseSDKAdaptor, ESPRMNeoBaseAdaptorIdentifier } from '@sdk-adaptors/ESPRMNeoBase';
import { ESPRMMatterBaseSDKAdaptor, ESPRMMatterBaseAdaptorIdentifier } from '@sdk-adaptors/ESPRMMatterBase';
import { runtimeConfigManager } from '@config/runtime.config';
import { ESPMQTTAdapter } from '@native-adaptors/implementations/ESPMQTTAdapter';
import { ESPMatterControlAdapter } from '@native-adaptors/implementations/ESPMatterControlAdapter';
import {
  getResolvedActiveSdk,
  getRMSDKConfig,
  getRMNeoSDKConfig,
  getMatterSDKConfig,
} from "@config/sdk.config";
/**
 * Available adaptor identifiers.
 * Add new SDK adaptor identifiers here as new integrations are added.
 */
export const ADAPTOR_IDENTIFIERS = {
    ESPRM_BASE: ESPRMBaseAdaptorIdentifier,
    ESPRM_MATTER: ESPRMMatterBaseAdaptorIdentifier,
    ESPRMNEO_BASE: ESPRMNeoBaseAdaptorIdentifier,
} as const;

/**
 * Responsible for instantiating all SDK adaptors.
 * To integrate a new SDK: add its adaptor to the array returned by createAll().
 */
class AdaptorFactory {
    createAll(): ESPSDKAdaptor[] {
        return [
          new ESPRMBaseSDKAdaptor(getRMSDKConfig()),
          new ESPRMMatterBaseSDKAdaptor(getMatterSDKConfig()),
          new ESPRMNeoBaseSDKAdaptor(getRMNeoSDKConfig()),
        ];
    }
}

/**
 * CDF Bootstrap service.
 *
 * Singleton service that registers all SDK adaptors and boots the CDF runtime.
 */
class CDFBootstrap {
    private static instance: CDFBootstrap;
    private cdfInstance: ESPCDF | null = null;
    private _isInitialized = false;
    private sdkRegistry: AdaptorRegistry;

    private constructor(private adaptorFactory: AdaptorFactory) {
        this.sdkRegistry = AdaptorRegistry.getInstance();
    }

    /**
     * Returns the singleton instance, creating it with the given factory on first call.
     * The factory is only used once — subsequent calls always return the same instance
     * regardless of the factory argument. Pass a custom factory before any other call
     * (e.g. in tests or at the composition root) if you need to override the default.
     */
    static getInstance(factory: AdaptorFactory = new AdaptorFactory()): CDFBootstrap {
        if (!CDFBootstrap.instance) {
            CDFBootstrap.instance = new CDFBootstrap(factory);
        }
        return CDFBootstrap.instance;
    }

    private safeExecute(fn: () => void, errorMessage: string): void {
        try {
            fn();
        } catch (error) {
            console.error(errorMessage, error);
        }
    }

    async initialize(): Promise<ESPCDF> {
        if (this._isInitialized && this.cdfInstance) {
            return this.cdfInstance;
        }

        try {
            const adaptors = this.adaptorFactory.createAll();

            adaptors.forEach(adaptor => {
                this.safeExecute(
                    () => {
                        const registered =
                            this.sdkRegistry.getRegisteredAdaptorIdentifiers();
                        if (registered.includes(adaptor._identifier)) {
                            return;
                        }
                        this.sdkRegistry.register(adaptor);
                    },
                    '[CDFBootstrap] Failed to register adaptor:'
                );
            });

            this.safeExecute(
                () =>
                    this.sdkRegistry.setActiveAdaptor(
                        getResolvedActiveSdk() as string
                    ),
                '[CDFBootstrap] Failed to set active adaptor:'
            );

            this.cdfInstance = await initCDF({ sdkAdaptorRegistry: this.sdkRegistry });
            this._isInitialized = true;

            return this.cdfInstance;

        } catch (error) {
            console.error('[CDFBootstrap] CDF initialization failed:', error);
            throw error;
        }
    }

    getCDFInstance(): ESPCDF | null {
        return this.cdfInstance;
    }

    isInitialized(): boolean {
        return this._isInitialized;
    }

    syncActiveAdaptor(): void {
        if (!this.cdfInstance) {
            throw new Error('[CDFBootstrap] CDF instance not initialized. Call initialize() first.');
        }
        this.safeExecute(
            () =>
                this.cdfInstance!.sdkAdaptorRegistry.setActiveAdaptor(
                    getResolvedActiveSdk() as string
                ),
            '[CDFBootstrap] Failed to sync active adaptor:'
        );
    }

    /**
     * Resets the CDF runtime and clears the adaptor registry.
     * A subsequent initialize() call will re-register all adaptors fresh.
     *
     * Teardown order matters:
     *   1. Live native connections (MQTT, Matter subscriptions), owned by native
     *      module instances tied to the current JS runtime. A `restartApp()`
     *      recreates that runtime but does not close connections opened on the
     *      old one, leaving orphaned native sockets under the fresh instances.
     *   2. `disposeCDF()`, which releases the store synchronizers' subscriptions
     *      and drops the `ESPCDF.instance` singleton. Nulling our own reference
     *      is not enough: `initCDF` returns the cached instance and DISCARDS the
     *      config it is given, so a re-initialise against a different backend
     *      would silently keep the previous deployment's stores. Runs before the
     *      registry is cleared, since the callbacks being torn down may still
     *      consult the active adaptor.
     */
    async reset(): Promise<void> {
        this._isInitialized = false;
        this.cdfInstance = null;

        await Promise.allSettled([
            ESPMQTTAdapter.disconnect(),
            ESPMatterControlAdapter.shutdown?.(),
        ]);

        disposeCDF();

        AdaptorRegistry.getInstance().clear();
    }
}

export const cdfBootstrap = CDFBootstrap.getInstance();

/**
 * App-level initialisation entry point — called once before the UI tree mounts.
 *
 * Execution order:
 *   1. Load persisted runtime config from storage.
 *   2. Boot the CDF runtime and register all SDK adaptors (including Matter).
 */
export async function initializeApp(): Promise<void> {
    await runtimeConfigManager.loadFromStorage();
    await cdfBootstrap.initialize();
}
