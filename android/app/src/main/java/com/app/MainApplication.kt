/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app

import android.app.Application
import android.content.res.Configuration
import android.media.AudioAttributes
import com.oney.WebRTCModule.WebRTCModuleOptions
import org.webrtc.audio.JavaAudioDeviceModule
import com.app.utils.ESPAppUtilityModule
import com.app.discovery.ESPDiscoveryModule
import com.app.local_control.ESPLocalControlModule
import com.app.matter.ESPMatterModule
import com.app.matter.ESPMatterUtilityModule
import com.app.matter.MatterDiscoveryModule
import com.app.matter.FabricSessionManager
import com.app.notification.ESPNotificationModule
import com.app.oauth.ESPOauthModule
import com.app.provisioning.ESPProvModule
import com.app.mqtt.ESPMQTTModule
import com.app.restart.ESPAppRestartModule
import com.app.softap.ESPSoftAPModule
import com.app.wechat.WeChatModuleProvider
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

    override val reactHost: ReactHost by lazy {
        ExpoReactHostFactory.getDefaultReactHost(
            context = applicationContext,
            packageList = PackageList(this).packages.apply {
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPProvModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPDiscoveryModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPNotificationModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPLocalControlModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPOauthModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPAppUtilityModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(MatterDiscoveryModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPMatterModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPMatterUtilityModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPMQTTModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPSoftAPModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        listOf(ESPAppRestartModule(reactContext))
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
                // WeChat login — contributes the module on the CN flavor only
                // (no-op provider on global). See com.app.wechat.WeChatModuleProvider.
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
                        WeChatModuleProvider.create(reactContext)
                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
                        emptyList()
                })
            }
        )
    }

    override fun onCreate() {
        // Route WebRTC audio through the media stream (loudspeaker) instead of the call stream
        // (earpiece). Must run before WebRTCModule initializes via loadReactNative.
        val webrtcOptions = WebRTCModuleOptions.getInstance()
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        webrtcOptions.audioDeviceModule = JavaAudioDeviceModule.builder(this)
            .setAudioAttributes(audioAttributes)
            .createAudioDeviceModule()

        super.onCreate()
        loadReactNative(this)
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

    override fun onTerminate() {
        super.onTerminate()
        FabricSessionManager.clearCurrentFabric()
    }
}
