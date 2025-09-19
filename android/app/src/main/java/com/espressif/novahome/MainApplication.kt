/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome

import android.app.Application
import android.content.res.Configuration
import com.espressif.novahome.utils.ESPAppUtilityModule
import com.espressif.novahome.discovery.ESPDiscoveryModule
import com.espressif.novahome.local_control.ESPLocalControlModule
import com.espressif.novahome.notification.ESPNotificationModule
import com.espressif.novahome.oauth.ESPOauthModule
import com.espressif.novahome.provisioning.ESPProvModule
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.react.uimanager.ViewManager
import com.facebook.soloader.SoLoader
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {


    override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> {
                val packages = PackageList(this).packages
                packages.add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
                        return listOf(ESPProvModule(reactContext))
                    }

                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
                        return emptyList()
                    }
                })
                packages.add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
                        return listOf(ESPDiscoveryModule(reactContext))
                    }

                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
                        return emptyList()
                    }
                })
                packages.add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
                        return listOf(ESPNotificationModule(reactContext))
                    }

                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
                        return emptyList()
                    }
                })
                packages.add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
                        return listOf(ESPLocalControlModule(reactContext))
                    }

                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
                        return emptyList()
                    }
                })
                packages.add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
                        return listOf(ESPOauthModule(reactContext))
                    }

                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
                        return emptyList()
                    }
                })
                packages.add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
                        return listOf(ESPAppUtilityModule(reactContext))
                    }

                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
                        return emptyList()
                    }
                })
                return packages
            }

            override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }
    )

    override val reactHost: ReactHost
        get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        SoLoader.init(this, OpenSourceMergedSoMapping)
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            load()
        }
        try {
            ApplicationLifecycleDispatcher.onApplicationCreate(this)
        } catch (e: IllegalStateException) {
            // DevLauncher already initialized, skipping
        }

    }


    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
    }
}
