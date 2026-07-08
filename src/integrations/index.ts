/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDF, AdaptorRegistry, initCDF, ESPSDKAdaptor } from "@store";
import { ESPRMBaseSDKAdaptor, ESPRMBaseAdaptorIdentifier } from '@sdk-adaptors/ESPRMBase';
import { ESPRMNGBaseSDKAdaptor, ESPRMNGBaseAdaptorIdentifier } from '@sdk-adaptors/ESPRMNGBase';
import {
  ESPRMNGMatterBaseSDKAdaptor,
  ESPRMNGMatterBaseAdaptorIdentifier,
} from '@sdk-adaptors/ESPRMNGMatterBase';
import { ESPRMMatterBaseSDKAdaptor, ESPRMMatterBaseAdaptorIdentifier } from '@sdk-adaptors/ESPRMMatterBase';
import { runtimeConfigManager } from '@config/runtime.config';
import {
    getResolvedActiveSdk,
    getRMSDKConfig,
    getRMNGSDKConfig,
    getRMNGMatterSDKConfig,
    getMatterSDKConfig,
  } from '@config/sdk.config';
/**
 * Available adaptor identifiers.
 * Add new SDK adaptor identifiers here as new integrations are added.
 */
export const ADAPTOR_IDENTIFIERS = {
    ESPRM_BASE: ESPRMBaseAdaptorIdentifier,
    ESPRM_MATTER_BASE: ESPRMMatterBaseAdaptorIdentifier,
    ESPRMNG_BASE: ESPRMNGBaseAdaptorIdentifier,
    ESPRMNG_MATTER_BASE: ESPRMNGMatterBaseAdaptorIdentifier,
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
            new ESPRMNGBaseSDKAdaptor(getRMNGSDKConfig()),
            new ESPRMNGMatterBaseSDKAdaptor(getRMNGMatterSDKConfig()),
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
     */
    reset(): void {
        this._isInitialized = false;
        this.cdfInstance = null;
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
