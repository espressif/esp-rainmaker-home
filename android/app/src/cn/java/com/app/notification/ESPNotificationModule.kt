/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.notification

import android.util.Log
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * CN-flavor stub for ESPNotificationModule.
 *
 * The CN build ships without Firebase / FCM (push notifications are disabled),
 * so this module exposes the same JS bridge surface as the Global implementation
 * but performs no FCM work. It exists so shared code (MainApplication,
 * ESPNotificationQueue) compiles and the `ESPNotificationModule` native module is
 * always registered regardless of flavor.
 *
 * @param reactContext The React Native application context
 */
class ESPNotificationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ReactPackage {

    companion object {
        private const val TAG = "ESPNotificationModule"

        private const val PLATFORM_IDENTIFIER = "GCM_NOVA"

        // Kept for API parity with the Global flavor; CN never forwards FCM.
        var isNotificationListenerActive = true
    }

    init {
        ESPNotificationQueue.setReactContext(reactContext)
    }

    /**
     * Provides the name of this module for React Native integration.
     *
     * @return The name of the module.
     */
    override fun getName(): String {
        return "ESPNotificationModule"
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = listOf(this).toMutableList()

    /**
     * Push notifications are unavailable in the CN build (no Firebase/FCM).
     * Rejects so the JS layer can handle the absence of a device token.
     *
     * @param promise Promise rejected with a notifications-disabled error.
     */
    @ReactMethod
    fun getDeviceToken(promise: Promise) {
        Log.d(TAG, "getDeviceToken called in CN build — notifications disabled")
        promise.reject(
            "NOTIFICATIONS_DISABLED",
            "Push notifications are not available in the CN build."
        )
    }

    /**
     * Retrieves the platform identifier for ESP RainMaker notifications.
     *
     * @param promise Promise that resolves with the platform identifier
     */
    @ReactMethod
    fun getNotificationPlatform(promise: Promise) {
        try {
            promise.resolve(PLATFORM_IDENTIFIER)
        } catch (e: Exception) {
            promise.reject("PLATFORM_ERROR", "Failed to get notification platform: ${e.message}")
        }
    }

    /**
     * No-op listener toggle (CN queues nothing — there is no FCM source).
     *
     * @param enable Retained for API parity with the Global flavor.
     */
    @ReactMethod
    fun toggleNotificationListener(enable: Boolean) {
        synchronized(this) {
            isNotificationListenerActive = enable
        }
    }
}
